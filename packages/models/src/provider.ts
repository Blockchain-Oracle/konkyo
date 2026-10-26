import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import type {
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
} from "@ai-sdk/provider"
import { MODEL_API, type ModelChoice, type ModelEffort } from "@konkyo/config"
import { env } from "@konkyo/env/server"
import { tapedFetch } from "@konkyo/tape"
import { type LanguageModel, wrapLanguageModel } from "ai"
import { hedged } from "./hedge"
import { limiterFor } from "./limiter"

/** Where the calls go: NVIDIA's API, or the self-hosted server MODEL_BASE_URL names. */
export const baseURL = env.MODEL_BASE_URL ?? MODEL_API.baseURL

/**
 * NVIDIA's API speaks the OpenAI chat format, so one OpenAI-compatible provider reaches every
 * Nemotron model. Through the tape: a CLI sample run replays recorded replies (S09).
 */
export const nvidia = createOpenAICompatible({
  name: "nvidia",
  baseURL,
  apiKey: env.NVIDIA_API_KEY,
  fetch: tapedFetch,
  includeUsage: true,
  supportsStructuredOutputs: true,
})

/** The key has no credit left: no retry, and no fallback model on the same key, helps. */
export class OutOfCreditError extends Error {
  constructor() {
    super("Konkyo's AI service is out of credit right now. Try again later.")
    this.name = "OutOfCreditError"
  }
}

function isOutOfCredit(error: unknown): boolean {
  const e = error as { statusCode?: number; message?: string }
  return (
    e?.statusCode === 402 ||
    /out of credits?|insufficient credits?|payment required/i.test(e?.message ?? "")
  )
}

// Thrown inside the SDK's retry loop as a non-API error, so it isn't retried with backoff.
const failFast = (error: unknown): never => {
  throw isOutOfCredit(error) ? new OutOfCreditError() : error
}

/** The model didn't answer within its deadline: the role's fallback takes over. */
export class ModelTimeoutError extends Error {
  constructor(modelId: string, ms: number) {
    super(`${modelId} gave no answer within ${Math.round(ms / 1000)} s`)
    this.name = "ModelTimeoutError"
  }
}

/** A deadline joined to the caller's own signal; `timedOut` tells it apart from a stop. */
function deadline(params: LanguageModelV4CallOptions, ms: number) {
  const timer = new AbortController()
  const handle = setTimeout(() => timer.abort(), ms)
  return {
    signal: params.abortSignal ? AbortSignal.any([params.abortSignal, timer.signal]) : timer.signal,
    timedOut: () => timer.signal.aborted && !params.abortSignal?.aborted,
    clear: () => clearTimeout(handle),
  }
}

/** A stream that has begun: its first content read, the rest still to come. */
type Started = {
  result: LanguageModelV4StreamResult
  reader: ReadableStreamDefaultReader<LanguageModelV4StreamPart>
  head: LanguageModelV4StreamPart[]
}

/** Opens a stream and reads up to its first content (text, reasoning or a tool call). */
async function begin(open: () => PromiseLike<LanguageModelV4StreamResult>): Promise<Started> {
  const result = await open()
  const reader = result.stream.getReader()
  const head: LanguageModelV4StreamPart[] = []
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    head.push(value)
    if (value.type !== "stream-start" && value.type !== "response-metadata") break
  }
  return { result, reader, head }
}

/** The begun stream again, from its first part. */
function resume({ reader, head }: Started): ReadableStream<LanguageModelV4StreamPart> {
  return new ReadableStream({
    start(controller) {
      for (const part of head) controller.enqueue(part)
    },
    async pull(controller) {
      const { value, done } = await reader.read()
      if (done) controller.close()
      else controller.enqueue(value)
    },
    cancel: (reason) => reader.cancel(reason),
  })
}

const hedgeLog = (id: string, ms: number) => () =>
  console.info(`[hedge] ${id}: no answer after ${ms} ms, asked again`)

/** A failure a fallback model can't fix: the person stopped it, or the key is out of credit. */
export const noFallback = (error: unknown) =>
  ["AbortError", "OutOfCreditError"].includes((error as Error)?.name)

/**
 * Every model call goes through its model's rate limiter, a hedge and a deadline. The hedge: when
 * the role sets hedgeAfterMs and nothing has come back by then (for a stream, its first content),
 * the same request goes out again and the first to answer wins. The deadline: an answer within
 * MODEL_API.answerTimeoutMs (or the role's deadlineMs), a stream's first content within
 * firstTokenTimeoutMs, or a ModelTimeoutError the role's fallback picks up.
 */
export function model(choice: ModelChoice): LanguageModel {
  const limiter = limiterFor(choice.id)
  const answerMs = choice.deadlineMs ?? MODEL_API.answerTimeoutMs
  const firstTokenMs = Math.min(answerMs, MODEL_API.firstTokenTimeoutMs)
  const after = choice.hedgeAfterMs
  const onHedge = after === undefined ? undefined : hedgeLog(choice.id, after)
  return wrapLanguageModel({
    model: nvidia(choice.id),
    middleware: {
      wrapGenerate: async ({ params, model: inner }) => {
        const due = deadline(params, answerMs)
        try {
          return await hedged({
            after,
            signal: due.signal,
            onHedge,
            attempt: (signal) =>
              limiter.run(() => inner.doGenerate({ ...params, abortSignal: signal })),
          })
        } catch (error) {
          return failFast(due.timedOut() ? new ModelTimeoutError(choice.id, answerMs) : error)
        } finally {
          due.clear()
        }
      },
      wrapStream: async ({ params, model: inner }) => {
        const due = deadline(params, firstTokenMs)
        try {
          const started = await hedged({
            after,
            signal: due.signal,
            onHedge,
            attempt: (signal) =>
              begin(() => limiter.run(() => inner.doStream({ ...params, abortSignal: signal }))),
            discard: ({ reader }) => void reader.cancel().catch(() => undefined),
          })
          return { ...started.result, stream: resume(started) }
        } catch (error) {
          return failFast(due.timedOut() ? new ModelTimeoutError(choice.id, firstTokenMs) : error)
        } finally {
          // The deadline is for the first content; once it has come, the stream runs its course.
          due.clear()
        }
      },
    },
  })
}

/**
 * Nemotron's thinking switch, through its chat template: off, low effort, or full. The same
 * request body works on NVIDIA's API and on a self-hosted vLLM or Nightshift server.
 */
const THINKING: Record<ModelEffort, Record<string, boolean | number>> = {
  off: { enable_thinking: false },
  low: { enable_thinking: true, low_effort: true, reasoning_budget: MODEL_API.thinkingBudget.low },
  high: { enable_thinking: true, reasoning_budget: MODEL_API.thinkingBudget.high },
}

export const reasoning = (choice: ModelChoice) => ({
  nvidia: { chat_template_kwargs: THINKING[choice.reasoning] },
})

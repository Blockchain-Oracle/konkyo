import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import type { LanguageModelV4CallOptions, LanguageModelV4StreamPart } from "@ai-sdk/provider"
import { MODEL_API, type ModelChoice, type ModelEffort } from "@konkyo/config"
import { env } from "@konkyo/env/server"
import { tapedFetch } from "@konkyo/tape"
import { type LanguageModel, wrapLanguageModel } from "ai"
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

/** Passes a stream through, ending the deadline at its first content and naming a timeout. */
function untilFirstContent(
  stream: ReadableStream<LanguageModelV4StreamPart>,
  due: ReturnType<typeof deadline>,
  timeout: () => Error,
): ReadableStream<LanguageModelV4StreamPart> {
  const reader = stream.getReader()
  return new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await reader.read()
        if (done) {
          due.clear()
          controller.close()
          return
        }
        if (value.type !== "stream-start" && value.type !== "response-metadata") due.clear()
        controller.enqueue(value)
      } catch (error) {
        due.clear()
        controller.error(due.timedOut() ? timeout() : error)
      }
    },
    cancel(reason) {
      due.clear()
      return reader.cancel(reason)
    },
  })
}

/** A failure a fallback model can't fix: the person stopped it, or the key is out of credit. */
export const noFallback = (error: unknown) =>
  ["AbortError", "OutOfCreditError"].includes((error as Error)?.name)

/**
 * Every model call goes through its model's rate limiter (a stream holds its slot until it
 * starts) and a deadline: an answer within MODEL_API.answerTimeoutMs (or the role's own
 * deadlineMs), a stream's first content within firstTokenTimeoutMs, or a ModelTimeoutError the
 * role's fallback picks up.
 */
export function model(choice: ModelChoice): LanguageModel {
  const limiter = limiterFor(choice.id)
  const answerMs = choice.deadlineMs ?? MODEL_API.answerTimeoutMs
  const firstTokenMs = Math.min(answerMs, MODEL_API.firstTokenTimeoutMs)
  return wrapLanguageModel({
    model: nvidia(choice.id),
    middleware: {
      wrapGenerate: ({ params, model: inner }) =>
        limiter
          .run(async () => {
            const due = deadline(params, answerMs)
            try {
              return await inner.doGenerate({ ...params, abortSignal: due.signal })
            } catch (error) {
              throw due.timedOut() ? new ModelTimeoutError(choice.id, answerMs) : error
            } finally {
              due.clear()
            }
          })
          .catch(failFast),
      wrapStream: ({ params, model: inner }) =>
        limiter
          .run(async () => {
            const due = deadline(params, firstTokenMs)
            const timeout = () => new ModelTimeoutError(choice.id, firstTokenMs)
            try {
              const result = await inner.doStream({ ...params, abortSignal: due.signal })
              return { ...result, stream: untilFirstContent(result.stream, due, timeout) }
            } catch (error) {
              due.clear()
              throw due.timedOut() ? timeout() : error
            }
          })
          .catch(failFast),
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

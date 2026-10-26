import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import type {
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
  SharedV4ProviderOptions,
} from "@ai-sdk/provider"
import { MODEL_API, type ModelChoice, type ModelEffort, providerOf } from "@konkyo/config"
import { env } from "@konkyo/env/server"
import { tapedFetch } from "@konkyo/tape"
import { type LanguageModel, wrapLanguageModel } from "ai"
import { markBusy, markOutOfCredit } from "./health"
import { hedged } from "./hedge"
import { limiterFor } from "./limiter"

/** Where Nemotron calls go: NVIDIA's API, or the self-hosted NIM MODEL_BASE_URL names. */
export const baseURL = env.MODEL_BASE_URL ?? MODEL_API.nvidia.baseURL

/** OpenAI's Responses API, through the tape like every model call in sample mode. */
export const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY, fetch: tapedFetch })

/**
 * NVIDIA's API speaks the OpenAI chat format, so one OpenAI-compatible provider reaches every
 * Nemotron model. Through the tape: a CLI sample run replays recorded replies.
 */
export const nvidia = createOpenAICompatible({
  name: "nvidia",
  baseURL,
  apiKey: env.NVIDIA_API_KEY,
  fetch: tapedFetch,
  includeUsage: true,
  supportsStructuredOutputs: true,
})

/** An account has no credit left: its calls go to the other provider until it has some again. */
export class OutOfCreditError extends Error {
  constructor() {
    super("Konkyo's AI service is out of credit right now. Try again later.")
    this.name = "OutOfCreditError"
  }
}

function isOutOfCredit(error: unknown): boolean {
  const e = error as {
    statusCode?: number
    message?: string
    data?: { error?: { code?: string; type?: string } }
  }
  const code = e?.data?.error?.code ?? e?.data?.error?.type
  return (
    e?.statusCode === 402 ||
    code === "insufficient_quota" ||
    code === "credit_balance_exhausted" ||
    /insufficient_quota|credit_balance_exhausted|no credits remaining|out of credits?|payment required/i.test(
      e?.message ?? "",
    )
  )
}

/** The model didn't answer within its deadline: the role's fallback takes over. */
export class ModelTimeoutError extends Error {
  constructor(modelId: string, ms: number) {
    super(`${modelId} gave no answer within ${Math.round(ms / 1000)} s`)
    this.name = "ModelTimeoutError"
  }
}

/**
 * The model refused for now (429): its fallback takes over at once, with no retries against a
 * model that just said it's full (the SDK would wait 2 s and 4 s, asking twice more).
 */
export class ModelBusyError extends Error {
  constructor(modelId: string) {
    super(`${modelId} is busy right now`)
    this.name = "ModelBusyError"
  }
}

/**
 * A failure as the caller should see it, noting a model that refused or stalled, and an account
 * out of credit (OpenAI answers that with a 429 too, so it is checked first). None of these is
 * retried by the SDK; the role's fallback, on the other provider, takes the call.
 */
function settle(modelId: string, error: unknown) {
  if (isOutOfCredit(error)) {
    markOutOfCredit(modelId)
    return new OutOfCreditError()
  }
  if ((error as { statusCode?: number })?.statusCode === 429) {
    markBusy(modelId)
    return new ModelBusyError(modelId)
  }
  if (error instanceof ModelTimeoutError) markBusy(modelId)
  return error
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
/**
 * The begun stream again, from its first part, with an idle deadline: a stream that goes quiet
 * mid-answer fails (and its role's fallback takes over) instead of holding the answer forever.
 */
function resume(
  { reader, head }: Started,
  idle: () => Error,
): ReadableStream<LanguageModelV4StreamPart> {
  return new ReadableStream({
    start(controller) {
      for (const part of head) controller.enqueue(part)
    },
    async pull(controller) {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const next = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(idle()), MODEL_API.streamIdleTimeoutMs)
          }),
        ])
        if (next.done) controller.close()
        else controller.enqueue(next.value)
      } catch (error) {
        void reader.cancel(error).catch(() => undefined)
        controller.error(error)
      } finally {
        clearTimeout(timer)
      }
    },
    cancel: (reason) => reader.cancel(reason),
  })
}

const hedgeLog = (id: string, ms: number) => () =>
  console.info(`[hedge] ${id}: no answer after ${ms} ms, asked again`)

const BUSY = "Konkyo's models are busy right now. Try again in a minute."

/**
 * What to tell the person when no model could answer (every one busy, stalled or out of credit),
 * or null for any other failure.
 */
export function modelTrouble(error: unknown): string | null {
  const name = (error as Error)?.name
  if (name === "OutOfCreditError") return (error as Error).message
  if (
    name === "ModelBusyError" ||
    name === "ModelTimeoutError" ||
    name === "AI_RetryError" ||
    name === "AI_NoOutputGeneratedError"
  )
    return BUSY
  return null
}

/**
 * A failure a fallback model can't fix: the person stopped it. (An empty account can: every
 * role's fallback is on the other provider.)
 */
export const noFallback = (error: unknown) => (error as Error)?.name === "AbortError"

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
    model: providerOf(choice.id) === "nvidia" ? nvidia(choice.id) : openai(choice.id),
    middleware: {
      transformParams: async ({ params }) => ({
        ...params,
        maxOutputTokens: params.maxOutputTokens ?? MODEL_API.maxOutputTokens,
      }),
      wrapGenerate: async ({ params, model: inner }) => {
        const due = deadline(params, answerMs)
        try {
          return await hedged({
            after,
            signal: due.signal,
            onHedge,
            attempt: (signal) =>
              limiter.run(() => inner.doGenerate({ ...params, abortSignal: signal }), signal),
          })
        } catch (error) {
          const timeout = new ModelTimeoutError(choice.id, answerMs)
          throw settle(choice.id, due.timedOut() ? timeout : error)
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
              begin(() =>
                limiter.run(() => inner.doStream({ ...params, abortSignal: signal }), signal),
              ),
            discard: ({ reader }) => void reader.cancel().catch(() => undefined),
          })
          const idle = () => {
            markBusy(choice.id)
            return new ModelTimeoutError(choice.id, MODEL_API.streamIdleTimeoutMs)
          }
          return { ...started.result, stream: resume(started, idle) }
        } catch (error) {
          const timeout = new ModelTimeoutError(choice.id, firstTokenMs)
          throw settle(choice.id, due.timedOut() ? timeout : error)
        } finally {
          // The deadline is for the first content; once it has come, the stream runs its course.
          due.clear()
        }
      },
    },
  })
}

/**
 * Nemotron's thinking switch, through its chat template: off, low effort, or full (the same
 * request body works on NVIDIA's API and on a self-hosted NIM or vLLM).
 */
const THINKING: Record<ModelEffort, Record<string, boolean | number>> = {
  none: { enable_thinking: false },
  minimal: { enable_thinking: false },
  low: { enable_thinking: true, low_effort: true, reasoning_budget: MODEL_API.thinkingBudget.low },
  medium: { enable_thinking: true, reasoning_budget: MODEL_API.thinkingBudget.high },
  high: { enable_thinking: true, reasoning_budget: MODEL_API.thinkingBudget.high },
}

/** How much a model thinks, in its own provider's terms (each provider reads only its own key). */
export const reasoning = (choice: ModelChoice): SharedV4ProviderOptions =>
  providerOf(choice.id) === "nvidia"
    ? { nvidia: { chat_template_kwargs: THINKING[choice.reasoning] } }
    : { openai: { reasoningEffort: choice.reasoning } }

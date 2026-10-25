import { createOpenAI } from "@ai-sdk/openai"
import { MODELS, type ModelChoice } from "@konkyo/config"
import { env } from "@konkyo/env/server"
import { tapedFetch } from "@konkyo/tape"
import { type LanguageModel, wrapLanguageModel } from "ai"
import { limiter } from "./limiter"
import type { TraceEvent, Tracer } from "./trace"

// Through the tape: a CLI sample run replays recorded replies (S09); otherwise plain fetch.
export const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY, fetch: tapedFetch })

export type { ModelChoice }
export { MODELS }

export type Role = keyof typeof MODELS

/** The OpenAI account is out of credit: no retry, and no fallback model on the same account, helps. */
export class OutOfCreditError extends Error {
  constructor() {
    super("Konkyo's AI service is out of credit right now. Try again later.")
    this.name = "OutOfCreditError"
  }
}

function isOutOfCredit(error: unknown): boolean {
  const e = error as { message?: string; data?: { error?: { code?: string; type?: string } } }
  const code = e?.data?.error?.code ?? e?.data?.error?.type
  return (
    code === "insufficient_quota" ||
    code === "credit_balance_exhausted" ||
    /insufficient_quota|credit_balance_exhausted|no credits remaining/i.test(e?.message ?? "")
  )
}

// Thrown inside the SDK's retry loop as a non-API error, so it isn't retried with backoff.
const failFast = (error: unknown): never => {
  throw isOutOfCredit(error) ? new OutOfCreditError() : error
}

/** A failure a fallback model can't fix: the person stopped it, or the account is out of credit. */
export const noFallback = (error: unknown) =>
  ["AbortError", "OutOfCreditError"].includes((error as Error)?.name)

/** Every model call goes through the shared rate limiter (a stream holds its slot until it starts). */
export const model = (choice: ModelChoice): LanguageModel =>
  wrapLanguageModel({
    model: openai(choice.id),
    middleware: {
      wrapGenerate: ({ doGenerate }) => limiter.run(doGenerate).catch(failFast),
      wrapStream: ({ doStream }) => limiter.run(doStream).catch(failFast),
    },
  })
export const reasoning = (choice: ModelChoice) => ({
  openai: { reasoningEffort: choice.reasoning },
})

export const EMBEDDING_MODEL = "text-embedding-3-small"

/**
 * Runs a call on the role's model, and once more on its fallback if that fails (an outage, a
 * malformed reply), logging the switch. Stopped runs and an empty account don't fall back.
 */
export async function withFallback<T>(
  role: Role,
  agent: TraceEvent["agent"],
  tracer: Tracer | undefined,
  step: string,
  fn: (choice: ModelChoice) => Promise<T>,
): Promise<{ result: T; choice: ModelChoice }> {
  const { primary, fallback } = MODELS[role]
  try {
    return { result: await fn(primary), choice: primary }
  } catch (error) {
    if (noFallback(error)) throw error
    tracer?.log({
      agent,
      step,
      action: "escalated_to_fallback",
      model: fallback.id,
      detail: { reason: (error as Error).message.slice(0, 300) },
    })
    return { result: await fn(fallback), choice: fallback }
  }
}

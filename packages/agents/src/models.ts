import { createOpenAI } from "@ai-sdk/openai"
import { env } from "@konkyo/env/server"
import { tapedFetch } from "@konkyo/tape"
import { type LanguageModel, wrapLanguageModel } from "ai"
import { limiter } from "./limiter"
import type { TraceEvent, Tracer } from "./trace"

// Through the tape: a CLI sample run replays recorded replies (S09); otherwise plain fetch.
export const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY, fetch: tapedFetch })

type Effort = "none" | "minimal" | "low" | "medium"
export type ModelChoice = { id: string; reasoning: Effort }

/**
 * Each agent's model, picked from the measured cost benchmark (gen-ai/.spikes/costs/BENCHMARK.md):
 * the cheapest OpenAI model that met each role's bar, with a fallback for outages and rate limits.
 */
export const MODELS = {
  /** Plans the run; the best support judgement among cheap models (0 false rejections). */
  planner: {
    primary: { id: "gpt-6-luna", reasoning: "low" },
    fallback: { id: "gpt-5-mini", reasoning: "minimal" },
  },
  /** Query rewriting and rerank: mechanical work, tool and JSON 3/3. */
  retriever: {
    primary: { id: "gpt-5-nano", reasoning: "minimal" },
    fallback: { id: "gpt-6-luna", reasoning: "none" },
  },
  /** Writes the cited answer: 9/9 quotes verbatim, first token in about 1 s. */
  writer: {
    primary: { id: "gpt-6-luna", reasoning: "none" },
    fallback: { id: "gpt-5-mini", reasoning: "minimal" },
  },
  /** Support checks: 0/10 false rejections, 6/6 planted errors caught. */
  verifier: {
    primary: { id: "gpt-6-luna", reasoning: "low" },
    fallback: { id: "gpt-5-mini", reasoning: "minimal" },
  },
  /** Deep search: plans queries and runs OpenAI's web_search (needs reasoning above minimal). */
  scout: {
    primary: { id: "gpt-5-nano", reasoning: "low" },
    fallback: { id: "gpt-5-mini", reasoning: "low" },
  },
  /** Screens found sources against the question, batch by batch (Markovian steps). */
  screener: {
    primary: { id: "gpt-6-luna", reasoning: "none" },
    fallback: { id: "gpt-5-mini", reasoning: "minimal" },
  },
  /** Claims and agreement across sources: the same strict-support judgement as the Verifier. */
  analyst: {
    primary: { id: "gpt-6-luna", reasoning: "low" },
    fallback: { id: "gpt-5-mini", reasoning: "minimal" },
  },
  /**
   * Makes practice items from passages (F27); every answer key then goes to the Verifier.
   * Measured testing, 3 runs × 12 windows: Luna (none) kept 35 items at $0.00025 each (65% pass,
   * ~4 s median draft, but a tail of 28-39 s calls); nano (low) kept 40 at $0.00059 each (60%
   * pass, ~11 s per draft): its reasoning tokens cost more than Luna's higher price. After hints
   * were told never to restate the answer, Luna passed 81-83% at $0.0002 per kept item.
   */
  tutor: {
    primary: { id: "gpt-6-luna", reasoning: "none" },
    fallback: { id: "gpt-5-nano", reasoning: "low" },
  },
  /** Judges a typed answer the code check couldn't settle, with feedback that never gives it away. */
  grader: {
    primary: { id: "gpt-6-luna", reasoning: "low" },
    fallback: { id: "gpt-5-mini", reasoning: "minimal" },
  },
} as const satisfies Record<string, { primary: ModelChoice; fallback: ModelChoice }>

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

import { createOpenAI } from "@ai-sdk/openai"
import { env } from "@konkyo/env/server"
import { type LanguageModel, wrapLanguageModel } from "ai"
import { limiter } from "./limiter"

export const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY })

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
} as const satisfies Record<string, { primary: ModelChoice; fallback: ModelChoice }>

export type Role = keyof typeof MODELS

/** Every model call goes through the shared rate limiter (a stream holds its slot until it starts). */
export const model = (choice: ModelChoice): LanguageModel =>
  wrapLanguageModel({
    model: openai(choice.id),
    middleware: {
      wrapGenerate: ({ doGenerate }) => limiter.run(doGenerate),
      wrapStream: ({ doStream }) => limiter.run(doStream),
    },
  })
export const reasoning = (choice: ModelChoice) => ({
  openai: { reasoningEffort: choice.reasoning },
})

export const EMBEDDING_MODEL = "text-embedding-3-small"

import { MODELS, type ModelChoice } from "@konkyo/config"
import { inOrder, noFallback } from "@konkyo/models"
import { isTapeMiss, tapeMode } from "@konkyo/tape"
import type { TraceEvent, Tracer } from "./trace"

export {
  inOrder,
  model,
  modelTrouble,
  noFallback,
  nvidia,
  OutOfCreditError,
  openai,
  outOfCredit,
  reasoning,
} from "@konkyo/models"
export type { ModelChoice }
export { MODELS }

export type Role = keyof typeof MODELS

/**
 * Runs a call on the role's models in turn (the ones answering first: `inOrder`), logging each
 * switch as `escalated_to_fallback`, until one answers. A stopped run doesn't fall back.
 */
export async function withFallback<T>(
  role: Role,
  agent: TraceEvent["agent"],
  tracer: Tracer | undefined,
  step: string,
  fn: (choice: ModelChoice) => Promise<T>,
): Promise<{ result: T; choice: ModelChoice }> {
  const order = inOrder(MODELS[role])
  let failure: unknown
  for (const [i, choice] of order.entries()) {
    try {
      return { result: await fn(choice), choice }
    } catch (error) {
      if (noFallback(error)) throw error
      failure = error
      // A replay skips, unlogged, a model the recorded run never asked: which models were busy
      // depended on the recording's timing, not on Konkyo's logic.
      if (tapeMode() === "replay" && isTapeMiss(error)) continue
      const next = order[i + 1]
      if (next)
        tracer?.log({
          agent,
          step,
          action: "escalated_to_fallback",
          model: next.id,
          detail: { reason: (error as Error).message.slice(0, 300), from: choice.id },
        })
    }
  }
  throw failure
}

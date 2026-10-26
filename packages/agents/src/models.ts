import { MODELS, type ModelChoice } from "@konkyo/config"
import { noFallback } from "@konkyo/models"
import type { TraceEvent, Tracer } from "./trace"

export {
  model,
  noFallback,
  nvidia,
  OutOfCreditError,
  reasoning,
} from "@konkyo/models"
export type { ModelChoice }
export { MODELS }

export type Role = keyof typeof MODELS

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

import { MODEL_API, type ModelChoice } from "@konkyo/config"

/**
 * Which models just refused (429) or stalled past their deadline. On NVIDIA's free tier a model's
 * health changes through the day: on testing, Ultra answered every benchmark call in the morning
 * and refused half of a slow trickle in the evening, while Super and Lightning answered all. A
 * busy model goes second for a while, so the next calls start on one that is answering.
 */
const shared = globalThis as typeof globalThis & { __konkyoBusy?: Map<string, number> }
shared.__konkyoBusy ??= new Map()
const busyUntil = shared.__konkyoBusy

export function markBusy(modelId: string) {
  busyUntil.set(modelId, Date.now() + MODEL_API.busyCooldownMs)
}

export const isBusy = (modelId: string) => (busyUntil.get(modelId) ?? 0) > Date.now()

/** A role's two models in the order to try them now: a busy primary swaps with its fallback. */
export function ordered<T extends { primary: ModelChoice; fallback: ModelChoice }>(
  role: T,
): { primary: ModelChoice; fallback: ModelChoice } {
  return isBusy(role.primary.id) && !isBusy(role.fallback.id)
    ? { primary: role.fallback, fallback: role.primary }
    : role
}

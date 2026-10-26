import { MODEL_API, type ModelChoice, providerOf, type RoleModels } from "@konkyo/config"

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

/** An account out of credit: every model of that provider goes second for a while. */
export function markOutOfCredit(modelId: string) {
  busyUntil.set(`provider:${providerOf(modelId)}`, Date.now() + MODEL_API.outOfCreditCooldownMs)
}

export const isBusy = (modelId: string) =>
  Math.max(busyUntil.get(modelId) ?? 0, busyUntil.get(`provider:${providerOf(modelId)}`) ?? 0) >
  Date.now()

/**
 * A role's models in the order to try them now: the ones answering first, in the role's own
 * order, then the busy ones (still worth a try when nothing else is left).
 */
export function inOrder(role: RoleModels): ModelChoice[] {
  const all = [role.primary, role.fallback, ...(role.reserve ? [role.reserve] : [])]
  return [...all.filter((c) => !isBusy(c.id)), ...all.filter((c) => isBusy(c.id))]
}

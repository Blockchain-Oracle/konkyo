import "server-only"

/**
 * Runs in progress in this server process, so Stop can end one (plan F15). A run is not tied to
 * its HTTP request: leaving the page mid-answer lets it finish and save, and the answer is there
 * on return. Only an explicit Stop aborts it.
 */
const running = new Map<string, { ownerId: string; controller: AbortController }>()

export function registerRun(runId: string, ownerId: string) {
  const controller = new AbortController()
  running.set(runId, { ownerId, controller })
  return controller.signal
}

export const endRun = (runId: string) => running.delete(runId)

export function stopRun(runId: string, ownerId: string) {
  const run = running.get(runId)
  if (!run || run.ownerId !== ownerId) return false
  run.controller.abort()
  return true
}

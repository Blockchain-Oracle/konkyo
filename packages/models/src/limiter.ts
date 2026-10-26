import { MODEL_API, providerOf } from "@konkyo/config"
import { env } from "@konkyo/env/server"

const WINDOW_MS = 60_000
/** A call waiting only for a free seat (not the minute's allowance) looks again this often. */
const SEAT_RECHECK_MS = 1_000

/**
 * Requests per minute as a sliding window (the starts of the last 60 s, never more than the
 * allowance: a refilling bucket let a full burst plus a minute's refill through), plus a cap on
 * calls in flight, for one model in this server process (plan §3). A call waits for room rather
 * than failing, and stops waiting when its signal aborts (its deadline, a hedge it lost, a stop).
 */
class Limiter {
  private starts: number[] = []
  private inFlight = 0
  private waiting = new Set<() => void>()

  constructor(
    private readonly perMinute: number,
    private readonly concurrent: number,
  ) {}

  private hasRoom(now: number) {
    while (this.starts.length && now - (this.starts[0] as number) >= WINDOW_MS) this.starts.shift()
    return this.starts.length < this.perMinute && this.inFlight < this.concurrent
  }

  /** Until the oldest start leaves the window, or a seat frees up; an abort ends the wait. */
  private wait(now: number, signal?: AbortSignal) {
    const full = this.starts.length >= this.perMinute
    const delay = full ? (this.starts[0] as number) + WINDOW_MS - now : SEAT_RECHECK_MS
    return new Promise<void>((resolve, reject) => {
      const done = () => {
        clearTimeout(timer)
        this.waiting.delete(done)
        signal?.removeEventListener("abort", stop)
        resolve()
      }
      const stop = () => {
        clearTimeout(timer)
        this.waiting.delete(done)
        reject(signal?.reason ?? new DOMException("The operation was aborted", "AbortError"))
      }
      const timer = setTimeout(done, Math.max(1, delay))
      this.waiting.add(done)
      signal?.addEventListener("abort", stop, { once: true })
    })
  }

  private async acquire(signal?: AbortSignal) {
    for (;;) {
      signal?.throwIfAborted()
      const now = Date.now()
      if (this.hasRoom(now)) {
        this.starts.push(now)
        this.inFlight++
        return
      }
      await this.wait(now, signal)
    }
  }

  private release() {
    this.inFlight--
    // One waiter looks again now; the others wake on their own timers.
    this.waiting.values().next().value?.()
  }

  async run<T>(fn: () => PromiseLike<T>, signal?: AbortSignal): Promise<T> {
    await this.acquire(signal)
    try {
      return await fn()
    } finally {
      this.release()
    }
  }
}

const shared = globalThis as typeof globalThis & { __konkyoLimiters?: Map<string, Limiter> }
shared.__konkyoLimiters ??= new Map()
const limiters = shared.__konkyoLimiters

/**
 * Every model has its own bucket, shared by every call to it here: NVIDIA limits each model
 * separately (in testing), and
 * this process takes its share of that (MODEL_REQUESTS_PER_MINUTE, half by default); an OpenAI
 * model gets the account-sized bucket.
 */
export function limiterFor(modelId: string): Limiter {
  let limiter = limiters.get(modelId)
  if (!limiter) {
    const nvidia = providerOf(modelId) === "nvidia"
    limiter = nvidia
      ? new Limiter(
          env.MODEL_REQUESTS_PER_MINUTE ?? MODEL_API.nvidia.requestsPerMinute / 2,
          MODEL_API.nvidia.callsInFlight,
        )
      : new Limiter(MODEL_API.openai.requestsPerMinute, MODEL_API.openai.callsInFlight)
    limiters.set(modelId, limiter)
  }
  return limiter
}

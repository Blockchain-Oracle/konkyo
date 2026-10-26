import { LIMITS } from "@konkyo/config"
import { env } from "@konkyo/env/server"

/**
 * A token bucket for requests per minute, plus a cap on calls in flight, for one model in this
 * server process (plan §3). A call waits for a token rather than failing; retries with backoff
 * handle the provider's 429s on top.
 */
class Limiter {
  private tokens: number
  private last = Date.now()
  private inFlight = 0
  private waiting: (() => void)[] = []

  constructor(
    private readonly perMinute: number,
    private readonly concurrent: number,
  ) {
    this.tokens = perMinute
  }

  private refill() {
    const now = Date.now()
    this.tokens = Math.min(
      this.perMinute,
      this.tokens + ((now - this.last) / 60_000) * this.perMinute,
    )
    this.last = now
  }

  private async acquire() {
    for (;;) {
      this.refill()
      if (this.tokens >= 1 && this.inFlight < this.concurrent) {
        this.tokens -= 1
        this.inFlight++
        return
      }
      await new Promise<void>((resolve) => {
        this.waiting.push(resolve)
        // A token comes back with time even if no call finishes.
        setTimeout(resolve, Math.ceil(60_000 / this.perMinute))
      })
    }
  }

  private release() {
    this.inFlight--
    this.waiting.shift()?.()
  }

  async run<T>(fn: () => PromiseLike<T>): Promise<T> {
    await this.acquire()
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
 * NVIDIA limits each model separately (in testing), so every model has its own bucket, shared by every call to it here.
 */
export function limiterFor(modelId: string): Limiter {
  let limiter = limiters.get(modelId)
  if (!limiter) {
    limiter = new Limiter(
      env.MODEL_REQUESTS_PER_MINUTE ?? LIMITS.modelRequestsPerMinute,
      LIMITS.modelCallsInFlight,
    )
    limiters.set(modelId, limiter)
  }
  return limiter
}

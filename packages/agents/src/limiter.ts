import { LIMITS } from "@konkyo/config"

/**
 * One token bucket for model requests per minute, plus a cap on calls in flight, shared by every
 * agent in this server process (plan §3). A call waits for a token rather than failing; the AI
 * SDK's own retries with backoff handle the provider's 429s on top.
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

const shared = globalThis as typeof globalThis & { __konkyoLimiter?: Limiter }
shared.__konkyoLimiter ??= new Limiter(LIMITS.modelRequestsPerMinute, LIMITS.modelCallsInFlight)
export const limiter = shared.__konkyoLimiter

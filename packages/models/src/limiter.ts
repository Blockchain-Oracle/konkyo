import { MODEL_API, providerOf } from "@konkyo/config"
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

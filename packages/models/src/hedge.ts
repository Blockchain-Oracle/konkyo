/**
 * Hedged requests ("The Tail at Scale", Dean and Barroso, 2013). NVIDIA's free tier answers most
 * calls in seconds but now and then holds one in its queue for minutes; the same request sent
 * again usually starts at once (in testing). So when the first attempt hasn't answered by `after`, a
 * second one goes out; whichever answers first wins and the other is cancelled.
 */
export function hedged<T>(options: {
  /** When the second attempt goes out; none when undefined. */
  after: number | undefined
  /** Stops every attempt (the caller's stop, or the call's deadline). */
  signal: AbortSignal
  attempt: (signal: AbortSignal) => Promise<T>
  /** Tidies up an attempt that answered after another had already won. */
  discard?: (value: T) => void
  onHedge?: () => void
}): Promise<T> {
  const { after, signal, attempt, discard, onHedge } = options
  return new Promise<T>((resolve, reject) => {
    const attempts: AbortController[] = []
    let settled = false
    let pending = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    const finish = (winner: number | null) => {
      settled = true
      clearTimeout(timer)
      attempts.forEach((controller, i) => {
        if (i !== winner) controller.abort()
      })
    }
    const launch = () => {
      const controller = new AbortController()
      const index = attempts.push(controller) - 1
      pending++
      attempt(AbortSignal.any([signal, controller.signal])).then(
        (value) => {
          pending--
          if (settled) return discard?.(value)
          finish(index)
          resolve(value)
        },
        (error) => {
          pending--
          // A failure while another attempt is still running waits for that one; otherwise it
          // stands (the SDK retries server errors with backoff; a hedge is only for slowness).
          if (settled || pending > 0) return
          finish(null)
          reject(error)
        },
      )
    }

    launch()
    if (after !== undefined) {
      timer = setTimeout(() => {
        if (settled) return
        onHedge?.()
        launch()
      }, after)
    }
  })
}

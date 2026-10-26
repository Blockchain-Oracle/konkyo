"use client"

import { type DeepState, emptyDeep, reduceDeep, type TimedDeepEvent } from "@konkyo/agents/deep"
import { useEffect, useState } from "react"

/** How often a hidden tab's view catches up with the stream. */
const HIDDEN_FLUSH_MS = 250

/**
 * A deep run's live state, rebuilt from its event stream. The browser's EventSource
 * reconnects by itself and sends Last-Event-ID, so the server resumes exactly where it left;
 * a reload replays from the start. Updates land once per frame however fast events arrive; a
 * hidden tab gets no frames, so there they land on a short timer instead, and someone who left
 * the tab during a long search still hears the answer arrive.
 */
export function useDeepRun(runId: string) {
  const [state, setState] = useState<DeepState>(emptyDeep)
  useEffect(() => {
    let current = emptyDeep()
    let frame = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const flush = () => setState(current)
    setState(current)
    const source = new EventSource(`/api/runs/${runId}/events`)
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as TimedDeepEvent
      current = reduceDeep(current, event)
      if (event.type === "end") source.close()
      cancelAnimationFrame(frame)
      clearTimeout(timer)
      if (document.hidden) timer = setTimeout(flush, HIDDEN_FLUSH_MS)
      else frame = requestAnimationFrame(flush)
    }
    // The stream closes after the run's last event; reconnecting then would only repeat that.
    source.onerror = () => {
      if (current.end) source.close()
    }
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
      source.close()
    }
  }, [runId])
  return state
}

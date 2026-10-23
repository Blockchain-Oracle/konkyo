"use client"

import { type DeepState, emptyDeep, reduceDeep, type TimedDeepEvent } from "@konkyo/agents/deep"
import { useEffect, useState } from "react"

/**
 * A deep run's live state (plan F19), rebuilt from its event stream. The browser's EventSource
 * reconnects by itself and sends Last-Event-ID, so the server resumes exactly where it left;
 * a reload replays from the start. Updates land once per frame however fast events arrive.
 */
export function useDeepRun(runId: string) {
  const [state, setState] = useState<DeepState>(emptyDeep)
  useEffect(() => {
    let current = emptyDeep()
    let frame = 0
    setState(current)
    const source = new EventSource(`/api/runs/${runId}/events`)
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as TimedDeepEvent
      current = reduceDeep(current, event)
      if (event.type === "end") source.close()
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setState(current))
    }
    // The stream closes after the run's last event; reconnecting then would only repeat that.
    source.onerror = () => {
      if (current.end) source.close()
    }
    return () => {
      cancelAnimationFrame(frame)
      source.close()
    }
  }, [runId])
  return state
}

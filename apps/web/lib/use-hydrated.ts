"use client"

import { useSyncExternalStore } from "react"

const subscribe = () => () => {}

/**
 * False while the server renders and while the page hydrates, true after. For values the server
 * can't know yet but the browser may already hold (a query streamed in before hydration), so the
 * first client render matches the HTML and the real value follows straight after.
 */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
}

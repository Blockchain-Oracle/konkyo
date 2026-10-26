"use client"

import { useEffect, useSyncExternalStore } from "react"

/** A passage the person chose to ask about, waiting in the composer as a quote. */
export type QuotedPassage = { fileId: string; title: string; page?: number; text: string }

let quote: QuotedPassage | null = null
const listeners = new Set<() => void>()

/** "Ask" from the selection toolbar: the quote goes into the composer, ready for a question. */
export function quoteInComposer(next: QuotedPassage | null) {
  quote = next
  for (const listener of listeners) listener()
}

export function useComposerQuote() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => quote,
    () => null,
  )
}

/**
 * Who on the page can take a quote: a composer, or the dock's panel. With a composer there it
 * goes to the composer; without one (a space wall, the library, the knows page) the dock's panel
 * opens with it. With neither, "Ask" goes to Home's composer.
 */
let composers = 0
let docks = 0
export const composerMounted = () => composers > 0
export const quoteTaker = () => composers > 0 || docks > 0
function usePresence(kind: "composer" | "dock") {
  useEffect(() => {
    if (kind === "composer") composers++
    else docks++
    return () => {
      if (kind === "composer") composers--
      else docks--
    }
  }, [kind])
}
export const useComposerPresence = () => usePresence("composer")
export const useDockPresence = () => usePresence("dock")

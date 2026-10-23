"use client"

import { useSyncExternalStore } from "react"

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

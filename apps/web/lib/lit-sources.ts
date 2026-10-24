"use client"

import { useSyncExternalStore } from "react"

/**
 * The sources an answer in the panel is reading, then citing (plan F48, OurSpaces' reading scan):
 * the wall behind rings them lime. One small store, so any card can ask "am I lit?".
 */
let lit = new Set<string>()
const listeners = new Set<() => void>()

export function setLitSources(fileIds: Iterable<string>) {
  const next = new Set(fileIds)
  if (next.size === lit.size && [...next].every((id) => lit.has(id))) return
  lit = next
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useLitSource(fileId: string) {
  return useSyncExternalStore(
    subscribe,
    () => lit.has(fileId),
    () => false,
  )
}

"use client"

import type { FileKind } from "@konkyo/config"
import { useSyncExternalStore } from "react"

/** Where to land inside a source: a page, a passage (highlighted), or a moment in a recording. */
export type SourceTarget = {
  page?: number
  passageId?: string
  /** The cited words: only the lines they span are marked, not the whole passage. */
  quote?: string
  seconds?: number
  /** Opened from an answer's citation: which answer and which number (for "Right passage?"). */
  cited?: { messageId: string; n: number }
  /** Bumped on every open, so asking for the same passage twice still scrolls and sweeps again. */
  nonce: number
}

export type SourceTab = {
  fileId: string
  title: string
  kind: FileKind
  target?: SourceTarget
}

type State = { tabs: SourceTab[]; activeId: string | null }

/** Open sources are few and short-lived, so tabs past this many close oldest-first. */
const MAX_TABS = 6

let state: State = { tabs: [], activeId: null }
const listeners = new Set<() => void>()
let nonce = 0

function set(next: State) {
  state = next
  for (const listener of listeners) listener()
}

/**
 * Opens a source in the preview pane (plan F07), reusing its tab if it is already open. Callable
 * from anywhere: library rows, citation chips, the command palette.
 */
export function openSource(
  source: Omit<SourceTab, "target"> & Omit<Partial<SourceTarget>, "nonce">,
) {
  const { fileId, title, kind, page, passageId, seconds, quote, cited } = source
  const target =
    page != null || passageId || seconds != null
      ? { page, passageId, seconds, quote, cited, nonce: ++nonce }
      : undefined
  const existing = state.tabs.find((tab) => tab.fileId === fileId)
  const tabs = existing
    ? state.tabs.map((tab) =>
        tab.fileId === fileId ? { ...tab, title, target: target ?? tab.target } : tab,
      )
    : [...state.tabs, { fileId, title, kind, target }].slice(-MAX_TABS)
  set({ tabs, activeId: fileId })
}

export function closeSource(fileId: string) {
  const index = state.tabs.findIndex((tab) => tab.fileId === fileId)
  if (index === -1) return
  const tabs = state.tabs.filter((tab) => tab.fileId !== fileId)
  const activeId =
    state.activeId === fileId
      ? (tabs[Math.min(index, tabs.length - 1)]?.fileId ?? null)
      : state.activeId
  set({ tabs, activeId })
}

export const showSource = (fileId: string) => set({ ...state, activeId: fileId })
export const closeAllSources = () => set({ tabs: [], activeId: null })

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const EMPTY: State = { tabs: [], activeId: null }

export function usePreview() {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY,
  )
  const active = snapshot.tabs.find((tab) => tab.fileId === snapshot.activeId) ?? null
  return { ...snapshot, active }
}

// Development only: lets the console (and browser tests) open a source at a passage, as a
// citation will: `konkyoOpenSource({ fileId, title, kind, passageId })`.
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  ;(window as unknown as { konkyoOpenSource: typeof openSource }).konkyoOpenSource = openSource
}

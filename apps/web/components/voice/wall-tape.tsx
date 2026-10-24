"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { useSpokenHighlight } from "@/lib/read-aloud"

/**
 * The answer taped onto its source (plan §16.5, beyond OurSpaces): after a spoken ask on a space
 * wall, the source the answer cites most rings lime and wears the short answer on a slip, the
 * sentence being read underlined, for a few seconds. OurSpaces tapes its answer slip onto the
 * card it came from; ours is the passage's own source.
 */

type Tape = { fileId: string; text: string; until: number; readingId?: string }

let tape: Tape | null = null
const watchers = new Set<() => void>()
const subscribe = (w: () => void) => {
  watchers.add(w)
  return () => {
    watchers.delete(w)
  }
}

export function tapeAnswer(fileId: string, text: string, ms: number, readingId?: string) {
  tape = { fileId, text, until: Date.now() + ms, readingId }
  for (const w of watchers) w()
  const el = document.querySelector<HTMLElement>(`[data-file-id="${CSS.escape(fileId)}"]`)
  el?.scrollIntoView({ block: "center", behavior: "smooth" })
}

/** Mounted once on a space wall: draws the slip on the source while there is one. */
export function WallTape() {
  const now = useSyncExternalStore(
    subscribe,
    () => tape,
    () => null,
  )
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [leaving, setLeaving] = useState(false)
  const slip = useRef<HTMLDivElement>(null)
  useSpokenHighlight(slip, now?.readingId)

  useEffect(() => {
    if (!now) return setHost(null)
    const el = document.querySelector<HTMLElement>(`[data-file-id="${CSS.escape(now.fileId)}"]`)
    setHost(el)
    setLeaving(false)
    el?.classList.add("is-taped")
    const left = Math.max(0, now.until - Date.now())
    const fade = window.setTimeout(() => setLeaving(true), left)
    const gone = window.setTimeout(() => {
      el?.classList.remove("is-taped")
      if (tape === now) tape = null
      for (const w of watchers) w()
    }, left + 320)
    return () => {
      window.clearTimeout(fade)
      window.clearTimeout(gone)
      el?.classList.remove("is-taped")
    }
  }, [now])

  if (!now || !host) return null
  return createPortal(
    <div ref={slip} className={`wall-tape${leaving ? " is-leaving" : ""}`} role="status">
      <span className="wall-tape-strip" aria-hidden="true" />
      <span className="voice-two-reply-tab">your sources say</span>
      <p>{now.text}</p>
    </div>,
    host,
  )
}

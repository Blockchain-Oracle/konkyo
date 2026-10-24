"use client"

/**
 * Read aloud (plan §16.5): an answer said by ElevenLabs with word timings, the sentence being read
 * underlined lime wherever that answer is on screen. One reader for the app: a new reading, a new
 * ask, or your voice over it (barge-in) stops the one before.
 *
 * The underline is the CSS Custom Highlight API (`::highlight(spoken)` in house.css): it paints a
 * range over the answer's own text nodes, so no answer renderer has to know about it.
 */

import { type RefObject, useEffect, useRef, useSyncExternalStore } from "react"
import { tapAudio } from "./sounds"

export type Reading = {
  /** The message (or slip) being read. */
  id: string
  sentences: string[]
  index: number
  state: "loading" | "playing" | "done" | "failed"
  /** The words of the sentence being read, as said. */
  sentence: string
}

type Word = { word: string; start: number; end: number }

let reading: Reading | null = null
let audio: HTMLAudioElement | null = null
let raf = 0
let settle: (() => void) | null = null
const watchers = new Set<() => void>()
const emit = () => {
  for (const w of watchers) w()
}
function set(next: Reading | null) {
  reading = next
  // what it is doing, readable from outside React (tests, captures)
  document.documentElement.dataset.reading = next ? `${next.state}:${next.index}` : ""
  emit()
}

/** Konkyo's voice now, 0..1, from the clip's word timings: the orb swells as it talks. */
export const speakingLevel = { current: 0 }

/** "[3]" chips and markdown out; what a person would say. */
export function speakable(text: string) {
  return text
    .replace(/\[\d+(?:[,\s]+\d+)*\]/g, "")
    .replace(/[*_`#>]+/g, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
}

export function sentencesOf(text: string): string[] {
  return (
    speakable(text)
      .match(/[^.!?]+(?:[.!?]+["”’)]*|$)/g)
      ?.map((s) => s.trim())
      .filter(Boolean) ?? []
  )
}

/** The short answer: whole sentences, up to about `max` characters (at least one). */
export function shortAnswer(text: string, max: number) {
  const out: string[] = []
  let length = 0
  for (const s of sentencesOf(text)) {
    if (out.length && length + s.length > max) break
    out.push(s)
    length += s.length + 1
  }
  return out
}

export function stopReading() {
  cancelAnimationFrame(raf)
  speakingLevel.current = 0
  if (audio) {
    audio.pause()
    audio.removeAttribute("src")
    audio = null
  }
  settle?.()
  settle = null
  if (reading && reading.state !== "done") set({ ...reading, state: "done" })
}

/**
 * Say these sentences, as `id`. Resolves when it has finished or was stopped (never rejects: a
 * failure just reads as done, with state "failed").
 */
export async function readAloud(id: string, sentences: string[]): Promise<void> {
  stopReading()
  if (!sentences.length) return
  // made inside the tap that asked, so it may still play once the clip arrives (iPhone)
  const player = tapAudio()
  set({ id, sentences, index: 0, state: "loading", sentence: sentences[0] ?? "" })
  let clip: { url: string; words: Word[] }
  try {
    const res = await fetch("/api/voice/speak", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: sentences.join(" "), voice: "speaker" }),
    })
    if (!res.ok) throw new Error(String(res.status))
    clip = (await res.json()) as typeof clip
  } catch {
    if (reading?.id === id) set({ ...reading, state: "failed" })
    return
  }
  if (reading?.id !== id || reading.state !== "loading") return
  // which sentence each word belongs to: the clip's words are the sentences' words, in order
  const owner: number[] = []
  sentences.forEach((s, i) => {
    for (const _ of s.split(/\s+/).filter(Boolean)) owner.push(i)
  })
  player.src = clip.url
  audio = player
  return new Promise<void>((resolve) => {
    settle = resolve
    const finish = () => {
      if (audio !== player) return
      cancelAnimationFrame(raf)
      speakingLevel.current = 0
      audio = null
      settle = null
      if (reading?.id === id) set({ ...reading, state: "done" })
      resolve()
    }
    player.addEventListener("ended", finish, { once: true })
    player.addEventListener("error", finish, { once: true })
    const tick = () => {
      const t = player.currentTime
      const at = clip.words.findIndex((w) => t < w.end)
      const word = clip.words[at]
      const index = owner[at < 0 ? owner.length - 1 : at] ?? 0
      // the orb's swell: a bump per word, as a voice's loudness would
      const inWord =
        word && t >= word.start ? (t - word.start) / Math.max(0.05, word.end - word.start) : 0
      speakingLevel.current +=
        ((word && t >= word.start ? 0.25 + 0.55 * Math.sin(inWord * Math.PI) : 0) -
          speakingLevel.current) *
        0.3
      if (reading?.id === id && (reading.index !== index || reading.state !== "playing"))
        set({ ...reading, index, state: "playing", sentence: sentences[index] ?? "" })
      raf = requestAnimationFrame(tick)
    }
    player
      .play()
      .then(() => {
        raf = requestAnimationFrame(tick)
      })
      .catch(finish)
  })
}

const subscribe = (w: () => void) => {
  watchers.add(w)
  return () => {
    watchers.delete(w)
  }
}

/** The reading of `id`, while it lasts. */
export function useReading(id: string | null | undefined): Reading | null {
  const now = useSyncExternalStore(
    subscribe,
    () => reading,
    () => null,
  )
  return id && now?.id === id && now.state !== "done" && now.state !== "failed" ? now : null
}

type HighlightRegistry = { set: (name: string, h: unknown) => void; delete: (name: string) => void }
const registry = () =>
  (globalThis as unknown as { CSS?: { highlights?: HighlightRegistry } }).CSS?.highlights

/** The range of `sentence` in `root`'s text, word by word (chips and spacing may differ). */
function rangeOf(root: HTMLElement, sentence: string): Range | null {
  const nodes: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      // citation chips say a number, not a word of the sentence
      n.parentElement?.closest("button, [data-chip], .citation-chip, .vcard-cite")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  })
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text)
  const text = nodes.map((n) => n.data).join("")
  const words = sentence.match(/[\p{L}\p{N}'’%-]+/gu)
  if (!words?.length) return null
  const literal = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const re = new RegExp(words.map(literal).join("[^\\p{L}\\p{N}]+"), "iu")
  const m = re.exec(text)
  if (!m) return null
  const locate = (offset: number): [Text, number] | null => {
    let at = 0
    for (const n of nodes) {
      if (offset <= at + n.data.length) return [n, offset - at]
      at += n.data.length
    }
    return null
  }
  const a = locate(m.index)
  const b = locate(m.index + m[0].length)
  if (!a || !b) return null
  const range = document.createRange()
  range.setStart(a[0], a[1])
  range.setEnd(b[0], b[1])
  return range
}

/** Underlines the sentence being read inside `root` while `id` is being read. */
export function useSpokenHighlight(
  root: RefObject<HTMLElement | null>,
  id: string | null | undefined,
) {
  const now = useReading(id)
  const sentence = now?.state === "playing" ? now.sentence : null
  const owned = useRef(false)
  useEffect(() => {
    const highlights = registry()
    const Highlight = (globalThis as unknown as { Highlight?: new (...r: Range[]) => unknown })
      .Highlight
    if (!highlights || !Highlight) return
    if (!sentence || !root.current) {
      if (owned.current) highlights.delete("spoken")
      owned.current = false
      return
    }
    const range = rangeOf(root.current, sentence)
    if (range) {
      highlights.set("spoken", new Highlight(range))
      owned.current = true
    }
  }, [root, sentence])
  useEffect(
    () => () => {
      if (owned.current) registry()?.delete("spoken")
    },
    [],
  )
  return now
}

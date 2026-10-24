/*
 * The seam between the voice stage and the build behind it, after OurSpaces' src/lib/voiceStage.ts
 * (https://github.com/thomasnguyen/ourspaces-app, MIT licence, Copyright (c) 2026 Thomas Nguyen).
 *
 * The stage (components/voice/voice-stage.tsx) shows the card being built on its right half. It
 * owns no pipeline and knows nothing about calls: it reads this one shape. The build
 * (components/voice/voice-build.tsx) runs Konkyo's real pipelines and writes it on every change.
 */

import type { VoiceKind } from "@konkyo/agents/intent"

export type PartValue = string | number

export type StagePart = {
  /** `question`, `source-0`, … */
  id: string
  label: string
  /** Waves land in order; parts that share one land together (a list, one row per beat). */
  wave: number
  /** pending: a skeleton. tentative: showing, from words you may still add to. final: settled. */
  status: "pending" | "tentative" | "final"
  value: PartValue | null
  /** A number that counts up to its value as it lands. */
  tick?: boolean
  /** Filled from your library rather than your words (an orange pip, OurSpaces' "from the room"). */
  library?: boolean
}

/** A source the answer is reading, or one a search found. */
export type StageSource = {
  fileId?: string
  title: string
  detail?: string
  host?: string
  kind?: string
  page?: number | null
}

/** Each card's own data, by kind. */
export type StageCardData =
  | {
      kind: "ask"
      question: string
      scope: string
      sources: StageSource[]
      answer: string
      final: boolean
      quotes: number | null
      notFound: boolean
    }
  | { kind: "find"; topic: string; into: string; found: StageSource[]; added: number | null }
  | { kind: "quiz"; topic: string; scope: string; made: number | null; ready: boolean }
  | { kind: "note"; title: string; scope: string; ready: boolean }
  | { kind: "brief"; scope: string; status: "making" | "ready" | "failed" | null }
  | { kind: "space"; name: string; color: string; symbol: string; ready: boolean }
  | { kind: "remember"; text: string; kept: boolean }

/** Where a finished card goes on close: the element it flies onto, or a page it opens. */
export type StageTarget = {
  /** Bring the target into the room first (open the AI panel). */
  prepare?: () => void
  /** Read every frame of the flight (the room may still be scrolling it into view). */
  el: () => HTMLElement | null
  /** Opened once the card lands (a session, a note, a new space). */
  href?: string
  /** The AI panel opens to take the card (an answer). */
  panel?: boolean
}

export type StageOffer = { label: string; say: string; from?: string }

/** Another verb than make (an answer said short, a catch up, a refusal): one slip, no card. */
export type StageReply = {
  verb: "answer" | "catchup" | "show" | "done" | "ask" | "no" | "remember"
  text: string
  source?: string
  offers?: StageOffer[]
}

export type StageBuild = {
  /** One per ask. */
  key: number
  said: string
  kind: VoiceKind | null
  card: StageCardData | null
  parts: StagePart[]
  /** Every part is final and the card knows where it goes. */
  complete: boolean
  target: StageTarget | null
  /** It couldn't: why, in a person's words. */
  failed: string | null
  reply: StageReply | null
  /** It asks for what's missing (at most two questions), with answers from your library. */
  question: { ask: string; field: string; offers: StageOffer[] } | null
  /** The second thing said in the same breath: its card waits on this one. */
  next: StageBuild | null
}

let current: StageBuild | null = null
const watchers = new Set<() => void>()

export function feedVoiceStage(build: StageBuild | null) {
  current = build
  for (const w of watchers) w()
}

export const watchVoiceStage = (w: () => void) => {
  watchers.add(w)
  return () => {
    watchers.delete(w)
  }
}
export const voiceStageBuild = () => current

/** What kind of thing it is saying, read off the reply: the slip's tab and colour follow. */
export function replyTone(reply: StageReply): { tone: "say" | "no" | "ask"; tab: string } {
  if (reply.verb === "ask") return { tone: "ask", tab: "one thing first" }
  if (reply.offers?.length) return { tone: "ask", tab: "which one?" }
  if (reply.verb === "no") return { tone: "no", tab: "it can't" }
  const tab = {
    answer: "your sources say",
    catchup: "catching you up",
    show: "here it is",
    done: "talk soon",
    remember: "it'll remember",
  }[reply.verb]
  return { tone: "say", tab }
}

/* ---- the release seam: anything that needs the room in view now lets the stage go ---- */

const releases = new Set<() => void>()
export function releaseVoiceStage() {
  for (const r of releases) r()
}
export function onVoiceStageRelease(listener: () => void) {
  releases.add(listener)
  return () => {
    releases.delete(listener)
  }
}

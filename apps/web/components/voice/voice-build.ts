"use client"

/**
 * The build behind a spoken ask (plan §16.5, S16): what turns words into a card on the stage and
 * the card into the real thing. While you talk, code reads the intent from every new word
 * (`guessIntent`, 0 ms) and the card is dealt as soon as the kind is known; words no pattern
 * places go to the cheap model (`/api/voice/intent`, two calls in flight at most). Anything
 * missing becomes a question on the card, never a guess. On the pause the real pipeline runs, and
 * each step it reports fills the next part: an answer streams through the AI panel's own chat, a
 * search through the deep-search run's events, practice through the set's verified-item count.
 *
 * It writes one shape to the stage (lib/voice-stage.ts) and never touches the stage itself.
 */

import { guessIntent, type Intent, type VoiceKind } from "@konkyo/agents/intent"
import { SPACES, STUDY, VOICE } from "@konkyo/config"
import { useQueryClient } from "@tanstack/react-query"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef } from "react"
import { toast } from "sonner"
import { api } from "@/lib/fetcher"
import { setLitSources } from "@/lib/lit-sources"
import { partsOf } from "@/lib/message-parts"
import { openSource } from "@/lib/preview"
import { qk } from "@/lib/query-keys"
import { readAloud, shortAnswer, stopReading } from "@/lib/read-aloud"
import { sound } from "@/lib/sounds"
import type { SpaceRow } from "@/lib/use-spaces"
import type { useVoice, VoiceHooks } from "@/lib/voice"
import {
  feedVoiceStage,
  type StageBuild,
  type StageCardData,
  type StageOffer,
  type StagePart,
  type StageReply,
  type StageSource,
  type StageTarget,
} from "@/lib/voice-stage"
import { beat } from "@/lib/voice-timings"
import type { usePanelChat } from "../shell/dock"
import { tapeAnswer } from "./wall-tape"

type Voice = ReturnType<typeof useVoice>
type PanelChat = ReturnType<typeof usePanelChat>

export type VoiceRoom = {
  spaceId: string | null
  spaceName: string | null
  spaces: SpaceRow[]
  chat: PanelChat
  openPanel: () => void
  /** The voice, for holding an ask open and listening on after an answer. */
  voice: () => Voice | null
}

type Need = { ask: string; field: "scope" | "topic" | "name" | "text"; offers: StageOffer[] }

type Run = {
  key: number
  said: string
  intent: Intent | null
  card: StageCardData | null
  /** Settled by the pipeline (words are only tentative until then). */
  settled: Set<string>
  complete: boolean
  target: StageTarget | null
  failed: string | null
  reply: StageReply | null
  question: Need | null
  /** Words counted when the question was asked: what comes after is the answer. */
  askedAt: number
  asked: number
  /** What answers to questions filled. */
  answers: { spaceId?: string; topic?: string }
  next: Run | null
  /** Once the card has landed. */
  after?: () => void
  /** The answer's message, once the panel's chat has it. */
  messageFrom?: number
  messageId?: string
  /** The pipeline settles this (the orb works until then). */
  settle?: () => void
  /** Its pipeline has started: a late word that reopens the ask doesn't run a second one (an
   *  answer is the exception: it is stopped and asked again with the longer words). */
  started?: boolean
  /** A chained ask waits on these files. */
  fileIds?: string[]
  spaceId?: string | null
}

const STEADY_MS = 200
/** How long the stage holds a practice card for its first questions before it lands anyway. */
const PRACTICE_WAIT_MS = 9000
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean)
const host = (url?: string) => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : undefined
  } catch {
    return undefined
  }
}
/** An API error in a person's words: the route's own message when it sent one. */
function reasonOf(error: Error) {
  try {
    const body = JSON.parse(error.message) as { error?: string }
    if (body.error) return body.error
  } catch {}
  return error.message && error.message.length < 160
    ? error.message
    : "couldn't answer that right now"
}
const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms))

/** A space named in the words ("…on my history essay"), best match first. */
function spaceIn(text: string, spaces: SpaceRow[]): SpaceRow | null {
  const said = text.toLowerCase()
  let best: { space: SpaceRow; score: number } | null = null
  for (const space of spaces) {
    const name = space.name.toLowerCase()
    if (said.includes(name)) return space
    const parts = name.split(/\s+/).filter((w) => w.length > 3)
    const score = parts.filter((w) => said.includes(w)).length / Math.max(1, parts.length)
    if (score >= 0.5 && (!best || score > best.score)) best = { space, score }
  }
  return best?.space ?? null
}

function skeleton(
  kind: VoiceKind,
  intent: Intent,
  room: VoiceRoom,
  run: Run,
): StageCardData | null {
  const space = room.spaces.find((s) => s.id === (run.answers.spaceId ?? room.spaceId))
  const scope = space?.name.toLowerCase() ?? "your library"
  switch (kind) {
    case "ask":
      return {
        kind,
        question: intent.topic,
        scope,
        sources: [],
        answer: "",
        final: false,
        quotes: null,
        notFound: false,
      }
    case "find":
      return { kind, topic: run.answers.topic ?? intent.topic, into: scope, found: [], added: null }
    case "quiz":
      return { kind, topic: intent.topic, scope, made: null, ready: false }
    case "note":
      return { kind, title: intent.topic, scope, ready: false }
    case "brief":
      return { kind, scope, status: null }
    case "space": {
      const color = pickColor(room.spaces)
      const name = run.answers.topic ?? intent.topic
      return { kind, name, color, symbol: (name.trim()[0] ?? "·").toUpperCase(), ready: false }
    }
    case "remember":
      return { kind, text: run.answers.topic ?? intent.topic, kept: false }
    default:
      return null
  }
}

function pickColor(spaces: SpaceRow[]) {
  const colors = Object.keys(SPACES.colors) as Array<keyof typeof SPACES.colors>
  const used = new Set(spaces.map((s) => s.color))
  return colors.find((c) => !used.has(c)) ?? colors[spaces.length % colors.length] ?? "violet"
}

/** The parts of a run's card, in the order and waves they land. */
function partsOf_(run: Run, listening: boolean): StagePart[] {
  const card = run.card
  if (!card) return []
  const words = (id: string, label: string, wave: number, value: string | null): StagePart => ({
    id,
    label,
    wave,
    value: value?.trim() ? value : null,
    status: value?.trim() ? (listening && !run.settled.has(id) ? "tentative" : "final") : "pending",
  })
  const fact = (
    id: string,
    label: string,
    wave: number,
    value: string | number | null,
    o: { tick?: boolean; library?: boolean } = {},
  ): StagePart => ({
    id,
    label,
    wave,
    value: value === null || value === "" ? null : value,
    status: value === null || value === "" ? "pending" : "final",
    ...o,
  })
  switch (card.kind) {
    case "ask": {
      const sources: StagePart[] = card.sources.length
        ? card.sources.map((s, i) => fact(`source-${i}`, "source", 2, s.title, { library: true }))
        : [0, 1, 2].map((i) => fact(`source-${i}`, "source", 2, null))
      return [
        words("question", "question", 0, card.question),
        fact("scope", "where", 1, run.settled.has("scope") ? card.scope : null, { library: true }),
        ...sources,
        {
          ...fact("answer", "answer", 3, card.answer || null),
          status: card.answer ? (card.final ? "final" : "tentative") : "pending",
        },
        fact("receipt", "checked", 4, card.quotes, { tick: true }),
      ]
    }
    case "find": {
      const found: StagePart[] = card.found.length
        ? card.found.map((s, i) => fact(`found-${i}`, "found", 2, s.title))
        : [0, 1, 2].map((i) => fact(`found-${i}`, "found", 2, null))
      return [
        words("topic", "topic", 0, card.topic),
        fact("into", "into", 1, run.settled.has("into") ? card.into : null, { library: true }),
        ...found,
        fact("added", "added", 3, card.added, { tick: true }),
      ]
    }
    case "quiz":
      return [
        words(
          "topic",
          "topic",
          0,
          card.topic || (run.settled.has("topic") ? "everything here" : null),
        ),
        fact("scope", "scope", 1, run.settled.has("scope") ? card.scope : null, { library: true }),
        fact("made", "made", 2, card.made, { tick: true }),
        fact("start", "start", 3, run.complete ? "start" : null),
      ]
    case "note":
      return [
        words("title", "title", 0, card.title || (run.settled.has("title") ? "untitled" : null)),
        fact("where", "where", 1, run.settled.has("where") ? card.scope : null, { library: true }),
        fact("open", "open", 2, card.ready ? "open" : null),
      ]
    case "brief":
      return [
        fact("scope", "scope", 0, run.settled.has("scope") ? card.scope : null, { library: true }),
        fact("ready", "making", 1, card.status ? card.status : null),
      ]
    case "space":
      return [
        words("name", "name", 0, card.name),
        fact("symbol", "symbol", 1, run.settled.has("name") ? card.symbol : null),
        fact("color", "colour", 1, run.settled.has("name") ? card.color : null),
        fact("ready", "ready", 2, card.ready ? "ready" : null),
      ]
    case "remember":
      return [
        words("text", "what", 0, card.text),
        fact("kept", "kept", 1, card.kept ? "kept" : null),
      ]
  }
}

export function useVoiceBuild(room: VoiceRoom): {
  hooks: VoiceHooks
  onLanded: (build: StageBuild) => void
} {
  const roomRef = useRef(room)
  roomRef.current = room
  const router = useRouter()
  const queryClient = useQueryClient()
  const current = useRef<Run | null>(null)
  const listening = useRef(false)
  const inFlight = useRef(0)
  const steady = useRef(0)
  const quiet = useRef(0)
  /** The pipeline, for a chained ask that starts from inside another's events. */
  const pipeline = useRef<(run: Run) => Promise<void>>(async () => {})

  const toBuild = useCallback((run: Run): StageBuild => {
    return {
      key: run.key,
      said: run.said,
      kind: run.intent?.kind ?? null,
      card: run.card,
      parts: partsOf_(run, listening.current),
      complete: run.complete,
      target: run.target,
      failed: run.failed,
      reply: run.reply,
      question: run.question,
      next: run.next ? toBuild(run.next) : null,
    }
  }, [])
  const emit = useCallback(() => {
    const run = current.current
    feedVoiceStage(run ? toBuild(run) : null)
  }, [toBuild])

  const fresh = useCallback(
    (said = ""): Run => ({
      key: Date.now(),
      said,
      intent: null,
      card: null,
      settled: new Set(),
      complete: false,
      target: null,
      failed: null,
      reply: null,
      question: null,
      askedAt: 0,
      asked: 0,
      answers: {},
      next: null,
    }),
    [],
  )

  /** Put an intent on a run: the card is dealt when the kind is first known, else updated. */
  const apply = useCallback(
    (run: Run, intent: Intent) => {
      const r = roomRef.current
      const kind = intent.kind
      const same = run.intent?.kind === kind && run.card
      run.intent = intent
      if (!same) run.card = skeleton(kind, intent, r, run)
      else if (run.card) {
        const topic = run.answers.topic ?? intent.topic
        const card = run.card
        if (card.kind === "ask") card.question = intent.topic
        else if (card.kind === "find") card.topic = topic
        else if (card.kind === "quiz") card.topic = intent.topic
        else if (card.kind === "note") card.title = intent.topic
        else if (card.kind === "remember") card.text = topic
        else if (card.kind === "space") {
          card.name = topic
          card.symbol = (topic.trim()[0] ?? "·").toUpperCase()
        }
      }
      // the second thing in the same breath gets its own card, waiting on this one
      if (intent.and) {
        const then = intent.and
        if (run.next?.intent?.kind !== then.kind) {
          run.next = fresh(run.said)
          run.next.intent = then
          run.next.card = skeleton(then.kind, then, r, run.next)
        } else if (run.next) apply(run.next, then)
      } else run.next = null
    },
    [fresh],
  )

  /** What the card can't do without and nothing said gives it. */
  const need = useCallback((run: Run, chained = false): Need | null => {
    const r = roomRef.current
    const intent = run.intent
    if (!intent) return null
    const topic = run.answers.topic ?? intent.topic
    switch (intent.kind) {
      case "quiz":
      case "brief": {
        if (chained || run.answers.spaceId || r.spaceId) return null
        if (spaceIn(`${intent.topic} ${run.said}`, r.spaces)) return null
        if (!r.spaces.length) return null
        return {
          ask: "which space?",
          field: "scope",
          offers: r.spaces
            .slice(0, 3)
            .map((s) => ({ label: s.name.toLowerCase(), say: s.name, from: "your spaces" })),
        }
      }
      case "find":
        return topic ? null : { ask: "find sources on what?", field: "topic", offers: [] }
      case "space":
        return topic ? null : { ask: "what's it for?", field: "name", offers: [] }
      case "remember":
        return topic ? null : { ask: "what should it remember?", field: "text", offers: [] }
      default:
        return null
    }
  }, [])

  // ---- while you talk ----
  const readByModel = useCallback(
    (said: string) => {
      if (inFlight.current >= 2) return
      inFlight.current++
      void api<Intent>("/api/voice/intent", {
        method: "POST",
        json: { said, spaceName: roomRef.current.spaceName },
      })
        .then((intent) => {
          const run = current.current
          // an answer for older words than the ones shown is ignored
          if (!run || run.intent || !run.said.startsWith(said)) return
          apply(run, intent)
          emit()
        })
        .catch(() => {})
        .finally(() => {
          inFlight.current--
        })
    },
    [apply, emit],
  )

  const heard = useCallback(
    (text: string) => {
      const r = roomRef.current
      let run = current.current
      if (!run) {
        run = fresh(text)
        current.current = run
      }
      run.said = text
      // an answer to the question on the card
      if (run.question && words(text).length > run.askedAt) {
        const answer = words(text).slice(run.askedAt).join(" ")
        if (run.question.field === "scope") {
          const space = spaceIn(answer, r.spaces)
          if (space) {
            run.answers.spaceId = space.id
            if (run.card && "scope" in run.card) run.card.scope = space.name.toLowerCase()
            run.question = null
          }
        } else {
          run.answers.topic = answer
          run.question = null
          if (run.intent) apply(run, run.intent)
        }
        emit()
        return
      }
      const intent = guessIntent(text)
      if (intent) apply(run, intent)
      else if (!run.intent && words(text).length >= 4) {
        window.clearTimeout(steady.current)
        steady.current = window.setTimeout(() => readByModel(text), STEADY_MS)
      }
      // a question waits for the words to go quiet
      window.clearTimeout(quiet.current)
      const missing = need(run)
      if (missing && run.asked < 2)
        quiet.current = window.setTimeout(() => {
          const now = current.current
          if (!now || now !== run || now.said !== text || !listening.current) return
          now.question = missing
          now.askedAt = words(text).length
          now.asked++
          sound("tap")
          emit()
        }, beat("pauseQuiet") * 0.7)
      emit()
    },
    [apply, emit, fresh, need, readByModel],
  )

  // ---- the answer, through the panel's own chat ----
  const chat = room.chat
  useEffect(() => {
    const run = current.current
    if (run?.card?.kind !== "ask" || run.messageFrom === undefined || run.complete) return
    const message = chat.messages.slice(run.messageFrom).findLast((m) => m.role === "assistant")
    if (chat.error && !message) {
      run.failed = reasonOf(chat.error)
      run.settle?.()
      emit()
      return
    }
    if (!message) return
    run.messageId = message.id
    const { sources, draft, final, receipt, notFound } = partsOf(message)
    const card = run.card
    const seen = new Map<string, StageSource>()
    for (const s of sources)
      if (!seen.has(s.fileId))
        seen.set(s.fileId, { fileId: s.fileId, title: s.title, kind: s.kind, page: s.page })
    card.sources = [...seen.values()].slice(0, 4)
    // the sources it reads ring lime on the wall behind the stage
    if (!final && card.sources.length) setLitSources(card.sources.map((s) => s.fileId as string))
    if (final) setLitSources(final.citations.map((c) => c.fileId))
    card.answer = final?.body ?? draft
    card.final = Boolean(final)
    card.quotes = receipt?.quotes ?? null
    card.notFound = Boolean(notFound)
    if ((receipt || notFound || (final && !chat.running)) && !run.complete) {
      // On a space wall the answer lands on the source it cites most, taped there and read aloud
      // (plan §16.5, beyond OurSpaces); anywhere else it lands in the AI panel.
      const cited = final?.citations[0]?.fileId
      const onWall = cited && document.querySelector(`[data-file-id="${CSS.escape(cited)}"]`)
      if (onWall)
        run.target = {
          prepare: () =>
            document
              .querySelector(`[data-file-id="${CSS.escape(cited)}"]`)
              ?.scrollIntoView({ block: "center", behavior: "smooth" }),
          el: () =>
            document.querySelector<HTMLElement>(
              `[data-file-id="${CSS.escape(cited)}"] .board-object`,
            ),
        }
      run.complete = true
      run.settle?.()
    }
    emit()
  }, [chat.messages, chat.running, chat.error, emit])

  /** The second card of one breath, after the stage has gone: it runs and says when it's ready. */
  const startChained = useCallback((first: Run) => {
    const next = first.next
    if (!next || next.complete || next.failed || next.started)
      return
    ;next.started = true
    next.fileIds = first.fileIds
    next.answers.spaceId = first.spaceId ?? undefined
    void pipeline.current(next).then(() => {
      if (next.failed) {
        toast(next.failed)
        return
      }
      if (!next.complete) return
      sound("promote")
      const label =
        next.card?.kind === "quiz" ? "practice on what it found is ready" : "the next one is ready"
      toast(
        label,
        next.after ? { action: { label: "open", onClick: () => next.after?.() } } : undefined,
      )
    })
  }, [])

  /** A deep search's run, followed through its events until what it found is approved. */
  const followDeep = useCallback(
    (run: Run, runId: string) =>
      new Promise<void>((resolve) => {
        const card = run.card
        if (card?.kind !== "find") return resolve()
        const source = new EventSource(`/api/runs/${runId}/events`)
        const imported = new Map<string, { fileId: string; status: string }>()
        let approvedKeys: string[] = []
        let landed = false
        const land = (folderId: string) => {
          if (landed) return
          landed = true
          const onWall = window.location.pathname === `/spaces/${folderId}`
          run.target = {
            el: () =>
              document.querySelector<HTMLElement>(
                onWall ? ".space-masonry" : `.space-rail a[href="/spaces/${folderId}"]`,
              ) ?? document.querySelector<HTMLElement>(".space-rail"),
          }
          if (!onWall) run.after = () => router.push(`/spaces/${folderId}` as Route)
          run.complete = true
          emit()
          resolve()
        }
        source.onmessage = (message) => {
          let event: { type: string; [k: string]: unknown }
          try {
            event = JSON.parse(message.data)
          } catch {
            return
          }
          if (event.type === "found") {
            const s = event.source as { title: string; detail: string; kind: string; url?: string }
            card.found.push({ title: s.title, detail: s.detail, kind: s.kind, host: host(s.url) })
            emit()
          } else if (event.type === "shortlist") {
            const list = event as unknown as {
              candidates: Array<{ key: string }>
              folderName: string
              auto: boolean
            }
            // a spoken "find papers on X" is the go-ahead: what the Screener kept goes in
            if (!list.auto && list.candidates.length)
              void api(`/api/runs/${runId}/approve`, {
                method: "POST",
                json: {
                  keys: list.candidates.slice(0, 20).map((c) => c.key),
                  folderName: list.folderName,
                },
              }).catch(() => {
                run.failed = "found sources but couldn't add them"
                emit()
                resolve()
              })
          } else if (event.type === "approved") {
            const a = event as unknown as { keys: string[]; folderName: string; folderId: string }
            approvedKeys = a.keys
            card.into = a.folderName.toLowerCase()
            card.added = a.keys.length
            run.spaceId = a.folderId
            land(a.folderId)
          } else if (event.type === "file") {
            const f = event as unknown as { key: string; fileId: string; status: string }
            imported.set(f.key, { fileId: f.fileId, status: f.status })
            // a chained ask ("…and quiz me on them") starts once what was added is read
            const settled = approvedKeys.filter((k) =>
              ["ready", "failed"].includes(imported.get(k)?.status ?? ""),
            )
            if (run.next && approvedKeys.length && settled.length === approvedKeys.length) {
              run.fileIds = approvedKeys
                .map((k) => imported.get(k))
                .filter((f) => f?.status === "ready")
                .map((f) => f?.fileId as string)
              startChained(run)
            }
          } else if (event.type === "end") {
            source.close()
            const status = (event as { status?: string }).status
            if (!landed) {
              run.failed =
                status === "nothing-found"
                  ? "found nothing worth adding on that"
                  : "couldn't search right now"
              emit()
              resolve()
            }
          }
        }
        source.onerror = () => {
          if (source.readyState === EventSource.CLOSED && !landed) {
            run.failed = "lost the search on the way"
            emit()
            resolve()
          }
        }
      }),
    [emit, router, startChained],
  )

  /** After an answer lands in the panel: say the short answer, tape it to its source on the wall,
   *  open the passage, and keep listening for a follow-up. */
  const afterAnswer = useCallback((run: Run) => {
    const r = roomRef.current
    const message = run.messageId ? r.chat.messages.find((m) => m.id === run.messageId) : null
    if (!message) return
    const { final } = partsOf(message)
    if (!final) return
    const said = shortAnswer(final.body, VOICE.shortAnswerChars)
    const strongest = final.citations[0]
    const voice = r.voice()
    const onWall = Boolean(run.target && !run.target.panel)
    // its own voice is not your next ask; yours over it is (barge-in)
    voice?.listenOn(120_000, said.join(" "))
    // on the wall: the short answer taped to its source, held while it reads (about 15
    // characters a second) and a moment more; the full answer waits in the panel's thread
    if (onWall && strongest)
      tapeAnswer(
        strongest.fileId,
        said.join(" "),
        beat("tapeHold") + said.join(" ").length * 65,
        run.messageId,
      )
    void readAloud(run.messageId as string, said).then(() => {
      voice?.listenOn(beat("followUpListen"), null)
      // then the passage it stands on opens on paper, with the highlighter
      if (onWall && strongest)
        openSource({
          fileId: strongest.fileId,
          title: strongest.title,
          kind: strongest.kind as never,
          passageId: strongest.passageId,
          quote: strongest.quote,
          cited: { messageId: run.messageId as string, n: strongest.n },
        })
    })
  }, [])

  /** A run's pipeline, by kind. Resolves when its card is complete (or it failed). */
  const runPipeline = useCallback(
    async (run: Run): Promise<void> => {
      const r = roomRef.current
      const intent = run.intent
      const card = run.card
      if (!intent) return
      const spaceId =
        run.answers.spaceId ??
        (intent.kind === "quiz" || intent.kind === "brief"
          ? (spaceIn(`${intent.topic}`, r.spaces)?.id ?? r.spaceId)
          : r.spaceId)
      run.spaceId = spaceId
      const space = r.spaces.find((s) => s.id === spaceId)
      if (card && "scope" in card) card.scope = space?.name.toLowerCase() ?? "your library"
      for (const id of ["scope", "into", "where", "topic", "title", "name", "question", "text"])
        run.settled.add(id)
      emit()
      const fail = (why: string) => {
        run.failed = why
        emit()
      }
      try {
        switch (intent.kind) {
          case "ask": {
            if (card?.kind !== "ask") return
            // a late word reopened an ask whose answer had started: that one is stopped and this
            // one replaces it, never answered twice
            if (run.messageFrom !== undefined && !run.complete) {
              const earlier = r.chat.messages.slice(run.messageFrom).findLast((m) => m.role === "assistant")
              const runId = earlier?.metadata?.runId
              await r.chat.stop()
              if (runId) void api(`/api/runs/${runId}/stop`, { method: "POST" }).catch(() => {})
              Object.assign(card, { sources: [], answer: "", final: false, quotes: null, notFound: false })
            }
            run.messageFrom = r.chat.messages.length
            run.target = {
              prepare: r.openPanel,
              el: () =>
                document.querySelector<HTMLElement>(".recap-thread > li:last-child .recap-answer"),
              panel: true,
            }
            const done = new Promise<void>((resolve) => {
              run.settle = resolve
            })
            r.chat.send(card.question)
            emit()
            await done
            run.after = () => afterAnswer(run)
            return
          }
          case "find": {
            if (card?.kind !== "find") return
            const topic = card.topic || intent.topic
            const { runId } = await api<{ runId: string }>("/api/deep", {
              method: "POST",
              json: {
                chatId: crypto.randomUUID(),
                question: topic,
                ...(spaceId ? { intoFolderId: spaceId, scope: { folderIds: [spaceId] } } : {}),
              },
            })
            await followDeep(run, runId)
            return
          }
          case "quiz": {
            if (card?.kind !== "quiz") return
            // the route takes both lists: the files a chained search added, else the space
            const scope = run.fileIds?.length
              ? { fileIds: run.fileIds, folderIds: [] }
              : { fileIds: [], folderIds: spaceId ? [spaceId] : [] }
            const { id } = await api<{ id: string }>("/api/study/sets", {
              method: "POST",
              json: { scope, ...(card.topic ? { title: card.topic } : {}) },
            })
            const href = `/study/session?mode=quiz&set=${id}`
            // ready to start at six verified items (STUDY.startAfter); the first ones take about a
            // minute, so the card lands after PRACTICE_WAIT_MS at most and the session page goes on
            // waiting with its own progress
            const started = Date.now()
            for (;;) {
              const set = await api<{ status: string; made: number; items: number }>(
                `/api/study/sets/${id}`,
              )
              card.made = Math.max(set.made, set.items)
              if (set.status === "failed") return fail("couldn't make practice from these sources")
              if (set.status === "ready" && card.made === 0)
                return fail("these sources didn't give any checkable questions")
              if (card.made >= STUDY.startAfter || set.status === "ready") break
              if (Date.now() - started > PRACTICE_WAIT_MS) break
              emit()
              await sleep(1200)
            }
            card.ready = (card.made ?? 0) >= STUDY.startAfter
            run.target = { el: () => document.querySelector<HTMLElement>('a[href="/study"]') }
            run.after = () => router.push(href as Route)
            run.complete = true
            emit()
            return
          }
          case "note": {
            if (card?.kind !== "note") return
            const { id } = await api<{ id: string }>("/api/notes", {
              method: "POST",
              json: { title: card.title || "untitled", ...(spaceId ? { folderId: spaceId } : {}) },
            })
            card.ready = true
            void queryClient.invalidateQueries({ queryKey: ["notes"] })
            run.target = { el: () => document.querySelector<HTMLElement>('a[href="/write"]') }
            run.after = () => router.push(`/write/${id}` as Route)
            run.complete = true
            emit()
            return
          }
          case "brief": {
            if (card?.kind !== "brief") return
            if (!spaceId) return fail("say which space to brief you on")
            const { id } = await api<{ id: string }>("/api/briefs", {
              method: "POST",
              json: { folderId: spaceId },
            })
            card.status = "making"
            run.target = {
              el: () =>
                document.querySelector<HTMLElement>(`.space-rail a[href="/spaces/${spaceId}"]`),
            }
            run.after = () => router.push(`/briefs/${id}` as Route)
            run.complete = true
            emit()
            return
          }
          case "space": {
            if (card?.kind !== "space") return
            const color = card.color as keyof typeof SPACES.colors
            const { id } = await api<{ id: string }>("/api/spaces", {
              method: "POST",
              json: {
                name: card.name.slice(0, 120),
                color,
                wall: SPACES.defaultWall[color],
                symbol: card.symbol,
                templateId: "empty",
              },
            })
            await queryClient.invalidateQueries({ queryKey: qk.spaces.all })
            card.ready = true
            run.target = {
              el: () => document.querySelector<HTMLElement>(`.space-rail a[href="/spaces/${id}"]`),
            }
            run.after = () => router.push(`/spaces/${id}` as Route)
            run.complete = true
            emit()
            return
          }
          case "remember": {
            if (card?.kind !== "remember") return
            await api("/api/memories", {
              method: "POST",
              json: { content: card.text.slice(0, 240) },
            })
            card.kept = true
            void queryClient.invalidateQueries({ queryKey: qk.memories })
            void queryClient.invalidateQueries({ queryKey: ["knows"] })
            run.target = { el: () => document.querySelector<HTMLElement>(".action-dock-ai") }
            run.complete = true
            emit()
            return
          }
        }
      } catch (error) {
        fail((error as Error).message?.slice(0, 140) || "couldn't do that right now")
      }
    },
    [emit, queryClient, router, followDeep, afterAnswer],
  )
  pipeline.current = runPipeline

  const hooks: VoiceHooks = {
    start: () => {
      listening.current = true
      window.clearTimeout(quiet.current)
      window.clearTimeout(steady.current)
      stopReading()
      current.current = fresh()
      emit()
    },
    words: heard,
    bargeIn: () => stopReading(),
    ready: (text) => ["catchup", "show", "done"].includes(guessIntent(text)?.kind ?? ""),
    ask: (said) => {
      listening.current = false
      window.clearTimeout(quiet.current)
      const r = roomRef.current
      let run = current.current
      if (!run) {
        run = fresh(said)
        current.current = run
      }
      run.said = said
      const thisRun = run
      return (async () => {
        let intent = guessIntent(said)
        if (!intent && thisRun.intent) intent = thisRun.intent
        if (!intent)
          intent = await api<Intent>("/api/voice/intent", {
            method: "POST",
            json: { said, spaceName: r.spaceName },
          }).catch(() => ({ kind: "ask" as const, topic: said }))
        apply(thisRun, intent)
        // walked away from a question: let it go, never guess
        const missing = need(thisRun)
        if (missing) {
          thisRun.question = null
          thisRun.failed =
            missing.field === "scope"
              ? "say which space, and ask again"
              : `${missing.ask.replace("?", "")} — say it again`
          emit()
          return
        }
        thisRun.question = null
        switch (intent.kind) {
          case "catchup":
            thisRun.reply = { verb: "catchup", text: "here's what moved since you last looked" }
            thisRun.complete = true
            thisRun.after = () => r.openPanel()
            r.voice()?.listenOn(0)
            emit()
            return
          case "show": {
            const last = r.chat.messages.findLast((m) => m.role === "assistant")
            const cite = last ? partsOf(last).final?.citations[0] : undefined
            if (!cite || !last) {
              thisRun.reply = { verb: "no", text: "there's no answer to show yet. ask one first" }
            } else {
              thisRun.reply = {
                verb: "show",
                text: `here it is · “${cite.quote.slice(0, 110)}${cite.quote.length > 110 ? "…" : ""}”`,
                source: `${cite.title}${cite.page ? `, p. ${cite.page}` : ""}`,
              }
              thisRun.after = () =>
                openSource({
                  fileId: cite.fileId,
                  title: cite.title,
                  kind: cite.kind as never,
                  passageId: cite.passageId,
                  quote: cite.quote,
                  cited: { messageId: last.id, n: cite.n },
                })
            }
            thisRun.complete = true
            emit()
            return
          }
          case "done":
            thisRun.reply = { verb: "done", text: "talk soon" }
            thisRun.complete = true
            r.voice()?.listenOn(0)
            stopReading()
            emit()
            return
          default:
            if (thisRun.started && intent.kind !== "ask") return
            thisRun.started = true
            await runPipeline(thisRun)
        }
      })()
    },
  }

  const onLanded = useCallback(
    (build: StageBuild) => {
      const run = current.current
      if (!run || run.key !== build.key) return
      run.after?.()
      // the stage has gone: a chained ask keeps going and says when it's ready
      if (run.next && run.fileIds) startChained(run)
    },
    [startChained],
  )

  return { hooks, onLanded }
}

"use client"

/*
 * Ported from OurSpaces (https://github.com/thomasnguyen/ourspaces-app, src/lib/voice.ts), MIT
 * licence, Copyright (c) 2026 Thomas Nguyen: the pause rules, the late-word reopen, the scripted
 * asks, mute, say, play, cancel and hold are theirs. Konkyo's changes: the words come from
 * ElevenLabs Scribe realtime (lib/scribe.ts) over one capture (lib/voice-input.ts) instead of the
 * browser's speech API; example asks play a real recorded voice; and the session can stay open
 * after an ask for a follow-up, where talking over Konkyo's own voice stops it (barge-in).
 */

import { sentenceHangs } from "@konkyo/agents/intent"
import { useCallback, useEffect, useRef, useState } from "react"
import { connectScribe, type ScribeSession } from "./scribe"
import {
  audioContext,
  type Capture,
  type CaptureSource,
  MicError,
  openCapture,
} from "./voice-input"
import { VOICE_TIMINGS, voiceSlow } from "./voice-timings"

/** The orb's three moods: resting, hearing you, and chewing on it. */
export type VoiceState = "idle" | "listening" | "working"

const wordsOf = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []

/**
 * A partial's words that are new after what this ask already committed. After a commit Scribe can
 * hand the same sentence over again as the next segment's partial; the overlap (the longest tail
 * of the committed words that the partial starts with) is not new speech.
 */
function newWords(committed: string, partial: string) {
  const had = wordsOf(committed)
  const got = wordsOf(partial)
  for (let k = Math.min(had.length, got.length); k > 0; k--) {
    const tail = had.slice(had.length - k).join(" ")
    if (got.slice(0, k).join(" ") === tail) {
      // keep the partial's own spelling for what's new
      const spelled = partial.trim().split(/\s+/)
      return spelled.slice(spelled.length - (got.length - k)).join(" ")
    }
  }
  return partial
}

const wordCount = (s: string) => s.match(/[\p{L}\p{N}']+/gu)?.length ?? 0

/** Mic loudness → 0..1. Fast attack, slow release, so the orb swells on a syllable and settles
 *  between words instead of flickering. */
function follow(level: { current: number }, target: number) {
  level.current += (target - level.current) * (target > level.current ? 0.35 : 0.08)
}

/** One scripted word's spoken length: ~180 words a minute, longer words longer. */
function wordMs(word: string) {
  const syllables = Math.max(
    1,
    word
      .toLowerCase()
      .replace(/[^a-z]/g, "")
      .match(/[aeiouy]+/g)?.length ?? 1,
  )
  return VOICE_TIMINGS.wordBase.ms + VOICE_TIMINGS.wordPerSyllable.ms * syllables
}

/** A hesitation mid-ask, written into a script as "…" or "..." ("…500": 500 ms). */
const HESITATE = /^(…|\.\.\.)(\d+)?$/

/** `?voice=…` plays a scripted ask instead of the mic (no microphone in a capture or a test):
 *  words land one at a time and the level fakes a speaking voice. `&voicePace=talk`: each word
 *  takes its spoken length and shows when it ends, the way a recogniser hands words over. The
 *  script never ends the ask itself: the pause after its last word does. */
function runScript(
  script: string,
  level: { current: number },
  onText: (text: string) => void,
  onDone: () => void,
  talking = false,
) {
  const q = new URLSearchParams(window.location.search)
  const talk = talking || q.get("voicePace") === "talk"
  const slow = voiceSlow()
  const pause = (Number(q.get("voicePause")) || VOICE_TIMINGS.hesitation.ms) * slow
  const tokens = script
    .replace(/(\S)(…|\.\.\.)/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean)
  const words: { word: string; from: number; to: number }[] = []
  let at = 0
  for (const token of tokens) {
    const hesitate = HESITATE.exec(token)
    if (hesitate) {
      at += hesitate[2] ? Number(hesitate[2]) * slow : pause
      continue
    }
    const len = (talk ? wordMs(token) : 300) * slow
    words.push({ word: token, from: at, to: at + len })
    at += len + (talk ? VOICE_TIMINGS.wordGap.ms * slow : 0)
  }
  const end = words.length ? (words[words.length - 1]?.to ?? 0) : 0
  const started = performance.now()
  let raf = 0
  const tick = () => {
    const t = performance.now() - started
    const spoken = words.filter((w) => (talk ? w.to <= t : w.from <= t)).length
    onText(
      words
        .slice(0, Math.max(talk ? 0 : 1, spoken))
        .map((w) => w.word)
        .join(" "),
    )
    const word = words.find((w) => w.from <= t && t < w.to)
    const inWord = word ? (t - word.from) / (word.to - word.from) : 0
    const syllable = Math.sin(inWord * Math.PI) * (0.55 + 0.35 * Math.sin(t / 97))
    follow(level, word ? Math.max(0, syllable) : 0)
    if (t > end + 5000 * slow) {
      onDone()
      return
    }
    raf = requestAnimationFrame(tick)
  }
  tick()
  return () => cancelAnimationFrame(raf)
}

/** A recorded example ask: the clip plays through the analyser (the orb moves to a real voice)
 *  and each word lands when the voice finishes saying it (the clip's own alignment). */
export type VoiceClip = { url: string; words: Array<{ word: string; end: number }> }

/** How an ask ended: the pause after the last word, or the done button. */
export type VoiceEnd = { how: "pause" | "done"; lastWordAt: number; endedAt: number }

/** What the room does with a finished ask. The orb stays "working" until the returned promise
 *  settles; without one it rests after 1.4 s. */
export type VoiceAsk = (said: string, end: VoiceEnd) => Promise<unknown> | undefined

/** The room listening along: `start` on the tap (and on a follow-up), `words` every time the
 *  transcript changes, `ask` once it ends. `ready`: these words already make a whole card, so a
 *  shorter quiet is enough to end on. `bargeIn`: words arrived while it was talking back. */
export type VoiceHooks = {
  start?: () => void
  words?: (text: string) => void
  ask?: VoiceAsk
  ready?: (text: string) => boolean
  bargeIn?: () => void
}

/** Quiet after the last word that ends the ask. */
const PAUSE_MS = VOICE_TIMINGS.pauseQuiet.ms
/** …unless the words stop mid-thought ("find papers on…"): then wait longer. */
const HANG_MS = VOICE_TIMINGS.pauseHang.ms
/** …and when the words already make a whole card (never on a trailing number). */
const READY_MS = 350
/** After a pause ends the ask, a word this soon reopens it instead of being lost. */
const LATE_MS = 1200
/** A loud room can't hold an ask open past this much quiet from the recogniser. */
const MAX_QUIET_MS = 2600
/** Nothing said at all: give up. */
const NOTHING_MS = 9000
/** With a live mic the voice must also have gone quiet this long: Scribe's words trail the audio
 *  by a few hundred ms, so "no new words" alone can fall mid-sentence. */
const QUIET_AUDIO_MS = 450
/** Loudness above this is someone talking. */
const TALKING = 0.12
/** The pause asks Scribe for its final words; this long at most, then the partial stands. */
const COMMIT_WAIT_MS = 500

async function mintToken(): Promise<string> {
  const res = await fetch("/api/voice/token", { method: "POST" })
  const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string }
  if (!res.ok || !body.token) throw new Error(body.error ?? "Voice isn't available right now.")
  return body.token
}

/** A token minted ahead (on the orb's hover), so the socket opens while you start to talk. Tokens
 *  live 15 minutes; one older than 10 is not used. */
let primed: { at: number; token: Promise<string> } | null = null
export function primeVoice() {
  if (primed && Date.now() - primed.at < 10 * 60_000) return
  // a scripted ask (`?voice=`) never opens the mic
  if (new URLSearchParams(window.location.search).has("voice")) return
  const token = mintToken()
  token.catch(() => {
    primed = null
  })
  primed = { at: Date.now(), token }
}
function takeToken() {
  const ready = primed && Date.now() - primed.at < 10 * 60_000 ? primed.token : null
  primed = null
  return ready ?? mintToken()
}

export function useVoice(hooks: VoiceHooks = {}, options: { keyterms?: string[] } = {}) {
  const [state, setState] = useState<VoiceState>("idle")
  const [transcript, setTranscript] = useState("")
  /** Why voice can't hear you (mic refused, no token): the stage offers typing instead. */
  const [problem, setProblem] = useState<string | null>(null)
  const said = useRef("")
  const hooksRef = useRef(hooks)
  hooksRef.current = hooks
  const keyterms = useRef(options.keyterms)
  keyterms.current = options.keyterms
  /** Read by the orb every frame; never goes through React. */
  const level = useRef(0)
  const workTimer = useRef(0)
  /** performance.now() of the newest words: the last word, once the ask ends. */
  const lastWordAt = useRef(0)
  const listenTimer = useRef(0)
  const listening = useRef(false)
  const [muted, setMuted] = useState(false)
  const mutedRef = useRef(false)
  const held = useRef(false)
  const lateTimer = useRef(0)
  /** The ask ended on a pause this recently: a new word reopens it. */
  const late = useRef(false)
  /** Words when it ended on that pause: only more words than this reopen it, never the same
   *  words handed over again (a recogniser's tidy-up, a script's next frame). */
  const endedWords = useRef(-1)
  const askSeq = useRef(0)

  // ---- the session: one capture and one Scribe socket, kept across a follow-up ----
  const capture = useRef<Capture | null>(null)
  const scribe = useRef<ScribeSession | null>(null)
  const stopScript = useRef<() => void>(() => {})
  const levelRaf = useRef(0)
  /** performance.now() when the mic last heard someone talking. */
  const lastLoudAt = useRef(0)
  /** Words of this ask committed by Scribe before the current segment. */
  const base = useRef("")
  /** The current segment's words (Scribe's partial). */
  const partial = useRef("")
  /** Waiting on the commit at the end of an ask: its partials belong to the ask that ended. */
  const committing = useRef<((text: string) => void) | null>(null)
  /** Listening for a new ask after this one (a follow-up), until this time. */
  const followUntil = useRef(0)
  const followTimer = useRef(0)
  /** What Konkyo is saying aloud now: its own words heard back through the mic are not an ask. */
  const speaking = useRef<string | null>(null)

  const closeSession = useCallback(() => {
    cancelAnimationFrame(levelRaf.current)
    stopScript.current()
    stopScript.current = () => {}
    capture.current?.stop()
    capture.current = null
    scribe.current?.close()
    scribe.current = null
    committing.current?.("")
    committing.current = null
    followUntil.current = 0
    window.clearTimeout(followTimer.current)
    level.current = 0
  }, [])

  const finish = useCallback(
    (how: VoiceEnd["how"] = "done") => {
      window.clearInterval(listenTimer.current)
      if (!listening.current) return
      listening.current = false
      const endedAt = performance.now()
      level.current = 0
      window.clearTimeout(lateTimer.current)
      late.current = how === "pause"
      endedWords.current = how === "pause" ? wordCount(said.current) : -1
      if (how === "pause")
        lateTimer.current = window.setTimeout(() => {
          late.current = false
          // nobody asked to keep listening: the mic goes off
          if (!listening.current && followUntil.current < Date.now()) closeSession()
        }, LATE_MS)
      else if (followUntil.current < Date.now()) {
        stopScript.current()
        stopScript.current = () => {}
      }
      setState("working")
      window.clearTimeout(workTimer.current)
      const seq = ++askSeq.current
      // Scribe's final words for this segment, or the partial if they're slow
      const words = scribe.current?.open
        ? new Promise<string>((resolve) => {
            const timer = window.setTimeout(() => resolve(""), COMMIT_WAIT_MS)
            committing.current = (text) => {
              window.clearTimeout(timer)
              resolve(text)
            }
            scribe.current?.commit()
          })
        : Promise.resolve("")
      void words.then((final) => {
        committing.current = null
        if (seq !== askSeq.current || listening.current) return
        const text = (final ? `${base.current} ${final}` : said.current).trim()
        if (final) {
          base.current = text
          partial.current = ""
          said.current = text
          setTranscript(text)
        }
        const pending = text
          ? hooksRef.current.ask?.(text, { how, lastWordAt: lastWordAt.current, endedAt })
          : undefined
        if (!pending) {
          workTimer.current = window.setTimeout(() => setState("idle"), 1400)
          return
        }
        // A stuck call must not hold the orb forever.
        workTimer.current = window.setTimeout(() => setState("idle"), 60_000)
        void pending.finally(() => {
          window.clearTimeout(workTimer.current)
          if (seq === askSeq.current) setState((s) => (s === "working" ? "idle" : s))
        })
      })
    },
    [closeSession],
  )

  /* A pause is the end: no new words for PAUSE_MS while the voice is quiet. */
  const listenForPause = useCallback(() => {
    const startedAt = performance.now()
    window.clearInterval(listenTimer.current)
    listenTimer.current = window.setInterval(() => {
      const now = performance.now()
      if (!said.current) {
        if (now - startedAt > NOTHING_MS * voiceSlow()) finish("pause")
        return
      }
      if (held.current) return
      const quiet = now - lastWordAt.current
      const slow = voiceSlow()
      const wait =
        (sentenceHangs(said.current)
          ? HANG_MS
          : !/\d\W*$/.test(said.current) && hooksRef.current.ready?.(said.current)
            ? READY_MS
            : PAUSE_MS) * slow
      const hushed = !capture.current || now - lastLoudAt.current > QUIET_AUDIO_MS * slow
      if ((quiet > wait && level.current < 0.2 && hushed) || quiet > MAX_QUIET_MS * slow) finish("pause")
    }, 25)
  }, [finish])
  const listenRef = useRef(listenForPause)
  listenRef.current = listenForPause

  /** Words of this ask so far (the whole ask, however it arrived). */
  const hear = useCallback((text: string) => {
    if (mutedRef.current) return
    if (!listening.current) {
      if (!text) return
      if (late.current) {
        // just ended on a pause: a new word reopens the same ask
        if (wordCount(text) <= endedWords.current) return
        late.current = false
        window.clearTimeout(lateTimer.current)
      } else if (followUntil.current > Date.now()) {
        // a follow-up: a new ask starts (talking over Konkyo stops it first)
        if (speaking.current) hooksRef.current.bargeIn?.()
        speaking.current = null
        base.current = ""
        said.current = ""
        hooksRef.current.start?.()
      } else return
      ++askSeq.current
      listening.current = true
      setState("listening")
      listenRef.current()
    }
    if (text && text !== said.current) {
      lastWordAt.current = performance.now()
      hooksRef.current.words?.(text)
    }
    said.current = text
    setTranscript(text)
  }, [])

  /** Scribe's words: the segment's partial on top of what this ask already committed. */
  const heardPartial = useCallback(
    (text: string) => {
      if (committing.current) return
      partial.current = text
      const spoken = speaking.current
      if (spoken && !listening.current) {
        // its own voice through the speakers: two words of yours that it isn't saying, held a
        // moment, are a barge-in
        const own = new Set(spoken.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [])
        const mine = (text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []).filter((w) => !own.has(w))
        // partials trail the audio, so "loud just now", not "loud at this instant"
        if (mine.length < 2 || performance.now() - lastLoudAt.current > 900) return
      }
      const fresh = base.current ? newWords(base.current, text) : text
      if (base.current && !fresh) return
      // a follow-up is a new ask: its words alone, never the last ask's in front of them
      const followUp = !listening.current && !late.current
      hear(followUp ? fresh : `${base.current} ${fresh}`.trim())
    },
    [hear],
  )

  const levelLoop = useCallback(() => {
    cancelAnimationFrame(levelRaf.current)
    const tick = () => {
      const c = capture.current
      if (c) {
        const loud = c.loudness()
        follow(level, loud)
        if (loud > TALKING) lastLoudAt.current = performance.now()
      }
      levelRaf.current = requestAnimationFrame(tick)
    }
    tick()
  }, [])

  /** Open the mic (or a dev clip) and Scribe, unless they're open already. */
  const openSession = useCallback(async () => {
    if (capture.current || scribe.current) return
    const dev = new URLSearchParams(window.location.search).get("voiceAudio")
    const source: CaptureSource = dev
      ? { kind: "clip", url: dev, transcribe: true }
      : { kind: "mic" }
    const session = connectScribe(
      takeToken(),
      {
        partial: heardPartial,
        committed: (text) => {
          if (committing.current) committing.current(text)
          else if (text) {
            // a commit we didn't ask for (the socket's own): fold it into this ask
            base.current = `${base.current} ${text}`.trim()
            partial.current = ""
          }
        },
        error: (message) => {
          console.warn("[voice] scribe:", message)
          setProblem(
            /token|auth|quota|limit/i.test(message) ? "voice is resting for today" : message,
          )
        },
      },
      { keyterms: keyterms.current, languageCode: "en" },
    )
    scribe.current = session
    try {
      capture.current = await openCapture(source, (chunk) => scribe.current?.send(chunk))
      levelLoop()
    } catch (error) {
      session.close()
      scribe.current = null
      setProblem(
        error instanceof MicError ? "the mic is off for this site" : (error as Error).message,
      )
    }
  }, [heardPartial, levelLoop])

  const start = useCallback(async () => {
    window.clearTimeout(workTimer.current)
    held.current = false
    late.current = false
    window.clearTimeout(lateTimer.current)
    lastWordAt.current = 0
    said.current = ""
    base.current = ""
    partial.current = ""
    setTranscript("")
    setProblem(null)
    setState("listening")
    ++askSeq.current
    listening.current = true
    hooksRef.current.start?.()
    listenForPause()
    // the gesture is now: browsers only let a tap start audio
    audioContext()

    const script = takeNextScript() ?? new URLSearchParams(window.location.search).get("voice")
    if (script) {
      closeSession()
      const hold = new URLSearchParams(window.location.search).has("stageHold")
      if (hold) window.clearInterval(listenTimer.current)
      stopScript.current = runScript(script, level, hear, hold ? () => {} : () => finish("pause"))
      return
    }
    // a follow-up keeps the session it had
    if (capture.current) {
      if (committing.current) committing.current("")
      return
    }
    await openSession()
  }, [closeSession, finish, hear, listenForPause, openSession])

  useEffect(
    () => () => {
      closeSession()
      window.clearTimeout(workTimer.current)
      window.clearInterval(listenTimer.current)
      window.clearTimeout(lateTimer.current)
    },
    [closeSession],
  )

  /** Mute stops the mic and drops what it hears; the ask stays open. */
  const mute = useCallback((on: boolean) => {
    mutedRef.current = on
    setMuted(on)
    capture.current?.mute(on)
  }, [])
  /** Put these words in as the ask (a starter, a typed line, an offer taken). */
  const say = useCallback(
    (text: string) => {
      stopScript.current()
      stopScript.current = () => {}
      level.current = 0
      mutedRef.current = false
      if (!listening.current && text) {
        ++askSeq.current
        listening.current = true
        setState("listening")
        listenRef.current()
      }
      hear(text)
    },
    [hear],
  )
  /** Typed instead of said (no mic): the same as words arriving. */
  const type = say
  /** An example ask, said out loud by a real recorded voice, then asked. */
  const play = useCallback(
    async (clip: VoiceClip | string) => {
      stopScript.current()
      mutedRef.current = false
      hear("")
      if (typeof clip === "string") {
        stopScript.current = runScript(clip, level, hear, () => finish("pause"), true)
        return
      }
      // the mic hears the speakers too: it rests while the example plays
      capture.current?.mute(true)
      const played = await openCapture({ kind: "clip", url: clip.url }).catch(() => null)
      if (!played) {
        stopScript.current = runScript(
          clip.words.map((w) => w.word).join(" "),
          level,
          hear,
          () => finish("pause"),
          true,
        )
        return
      }
      const started = performance.now()
      let raf = 0
      const tick = () => {
        const t = (performance.now() - started) / 1000
        follow(level, played.loudness())
        const shown = clip.words.filter((w) => w.end <= t).map((w) => w.word)
        if (shown.length) hear(shown.join(" "))
        raf = requestAnimationFrame(tick)
      }
      tick()
      stopScript.current = () => {
        cancelAnimationFrame(raf)
        played.stop()
        capture.current?.mute(mutedRef.current)
      }
      void played.ended.then(() => {
        hear(clip.words.map((w) => w.word).join(" "))
        stopScript.current()
        stopScript.current = () => {}
      })
    },
    [finish, hear],
  )
  /** Close without asking anything (Escape). */
  const cancel = useCallback(() => {
    window.clearInterval(listenTimer.current)
    window.clearTimeout(lateTimer.current)
    listening.current = false
    late.current = false
    held.current = false
    ++askSeq.current
    said.current = ""
    setTranscript("")
    window.clearTimeout(workTimer.current)
    setState("idle")
    closeSession()
    hooksRef.current.start?.()
  }, [closeSession])
  /** Keep the ask open across a pause (the stage is asking for the rest), or let pauses end it. */
  const hold = useCallback((on: boolean) => {
    if (held.current && !on) lastWordAt.current = performance.now()
    held.current = on
  }, [])
  /**
   * After an answer: keep the mic and Scribe open and take the next words as a new ask, for this
   * long (0 ends it now and closes the mic). While `saying` is set, its own words heard back are
   * ignored and yours stop it (barge-in).
   */
  const listenOn = useCallback(
    (ms: number, saying?: string | null) => {
      if (saying !== undefined) speaking.current = saying
      window.clearTimeout(followTimer.current)
      if (ms <= 0) {
        followUntil.current = 0
        if (!listening.current) closeSession()
        return
      }
      if (!capture.current && !scribe.current) return
      followUntil.current = Date.now() + ms
      followTimer.current = window.setTimeout(() => {
        followUntil.current = 0
        if (!listening.current && !speaking.current) closeSession()
      }, ms)
    },
    [closeSession],
  )
  useEffect(() => {
    if (state !== "listening") mute(false)
  }, [state, mute])

  return {
    state,
    transcript,
    level,
    problem,
    start,
    finish,
    muted,
    mute,
    say,
    type,
    play,
    cancel,
    hold,
    listenOn,
  }
}

/* A starter ask (the orb hint, a tapped example): the tap plays these words into the orb as if
   they were said, then the orb works exactly as for a spoken ask. */
let nextScript: string | null = null
export function setNextVoiceScript(words: string) {
  nextScript = words
}
function takeNextScript() {
  const words = nextScript
  nextScript = null
  return words
}

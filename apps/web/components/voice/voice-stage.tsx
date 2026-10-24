"use client"

/*
 * Ported from OurSpaces (https://github.com/thomasnguyen/ourspaces-app,
 * src/components/VoiceStage.tsx), MIT licence, Copyright (c) 2026 Thomas Nguyen. The orb's flight
 * (anticipation, arc, stretch, thump, squash home), the waveform, the words with the cue sticker,
 * the card dealt out of the orb and revealed part by part, the ring states, the reply slip, the
 * follow-up question with offers and the card's flight home are theirs, beat for beat
 * (lib/voice-timings.ts). Konkyo's: the cards are its own (an answer, a search, practice, a note,
 * a brief, a space), examples play in a real recorded voice, and with no mic you type instead.
 *
 * One orb canvas, moved between the dock and the stage, never a second orb.
 */

import { guessIntent, KIND_LABEL, sentenceHangs } from "@konkyo/agents/intent"
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { createPortal } from "react-dom"
import { orbLook } from "@/lib/orb-shader"
import { sound } from "@/lib/sounds"
import type { useVoice, VoiceClip } from "@/lib/voice"
import {
  onVoiceStageRelease,
  type PartValue,
  replyTone,
  type StageBuild,
  type StageReply,
  voiceStageBuild,
  watchVoiceStage,
} from "@/lib/voice-stage"
import { beat, voiceSlow } from "@/lib/voice-timings"
import { CARD_SIZE, StageCardBody } from "./stage-cards"
import { VoiceOrb } from "./voice-orb"

type Voice = ReturnType<typeof useVoice>
type Phase = "closed" | "open" | "closing"
export type StageExample = { say: string; clip?: VoiceClip | null }

const GLIDE = "cubic-bezier(0.16, 1, 0.3, 1)"
const POP = "cubic-bezier(0.2, 0.9, 0.3, 1.18)"
const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

/** The house curves, for moves that are driven per frame. */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  return (x: number) => {
    let t = x
    for (let i = 0; i < 6; i++) {
      const u = 1 - t
      const err = 3 * x1 * t * u * u + 3 * x2 * t * t * u + t * t * t - x
      const slope = 3 * x1 * (u * u - 2 * t * u) + 3 * x2 * (2 * t * u - t * t) + 3 * t * t
      if (Math.abs(slope) < 1e-5) break
      t -= err / slope
    }
    const u = 1 - t
    return 3 * y1 * t * u * u + 3 * y2 * t * t * u + t * t * t
  }
}
const glide = bezier(0.16, 1, 0.3, 1)
const pop = bezier(0.2, 0.9, 0.3, 1.18)
const sway = bezier(0.3, 0.6, 0.3, 1)

type Box = { x: number; y: number; w: number }
const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }
}

/** The orb's flight between the dock and the stage. It stays where layout put it; only its
 *  transform moves, re-aimed every frame. One arc (up out of the dock, sideways into the stage),
 *  stretched along its travel while it is fast, and with `press` it first pushes down into the
 *  dock before it goes. */
function fly(
  host: HTMLElement,
  from: () => Box,
  to: () => Box,
  ms: number,
  o: { grow: (t: number) => number; press?: number },
  done: () => void,
) {
  host.style.transform = ""
  const home = boxOf(host)
  const zoom = home.w / (host.offsetWidth || home.w) || 1
  const started = performance.now()
  const press = o.press ?? 0
  let raf = 0
  let last: { x: number; y: number } | null = null
  let stretch = 1
  // performance.now(), not the rAF timestamp: the two clocks can drift apart
  const frame = () => {
    const p = Math.min(1, (performance.now() - started) / ms)
    const a = from()
    const b = to()
    let x = a.x
    let y = a.y
    let w = a.w
    let angle = 0
    if (p < press) {
      // anticipation: down into the seat, and smaller, before the jump
      const q = Math.sin((p / press) * Math.PI)
      y = a.y + a.w * 0.06 * q
      w = a.w * (1 - 0.14 * q)
    } else {
      const t = (p - press) / (1 - press)
      const e = glide(t)
      const low = a.y > b.y ? a : b
      const high = a.y > b.y ? b : a
      const cx = low.x + (high.x - low.x) * 0.16
      const cy = high.y + (low.y - high.y) * 0.1
      const u = 1 - e
      x = u * u * a.x + 2 * u * e * cx + e * e * b.x
      y = u * u * a.y + 2 * u * e * cy + e * e * b.y
      w = a.w + (b.w - a.w) * o.grow(t)
      if (last) {
        const speed = Math.hypot(x - last.x, y - last.y)
        stretch += (1 + Math.min(0.22, (speed / Math.max(80, w)) * 0.8) - stretch) * 0.5
        if (speed > 0.5) angle = Math.atan2(y - last.y, x - last.x)
      }
    }
    last = { x, y }
    const k = w / home.w
    host.style.transform = `translate(${(x - home.x) / zoom}px, ${(y - home.y) / zoom}px) rotate(${angle}rad) scale(${k * stretch}, ${k / Math.sqrt(stretch)}) rotate(${-angle}rad)`
    if (p < 1) raf = requestAnimationFrame(frame)
    else done()
  }
  frame()
  return () => cancelAnimationFrame(raf)
}

/** Where the orb sits in the dock: centred on its key, 1.6 × the 58 px ball. */
const SEAT = 93
const seatBox = (seat: HTMLElement): Box => ({ ...boxOf(seat), w: SEAT })

function tokenRgb(name: string) {
  const hex = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
    .replace("#", "")
  const n = Number.parseInt(hex, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** The waveform under the orb: your loudness, newest in the middle, running out to both sides,
 *  in the orb's own violet → pink → orange. */
function StageWave({ level }: { level: RefObject<number> }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    const stops = [tokenRgb("--color-violet"), tokenRgb("--color-pink"), tokenRgb("--color-orange")]
    const colour = (t: number) => {
      const [a, b] = t < 0.5 ? [stops[0], stops[1]] : [stops[1], stops[2]]
      const k = t < 0.5 ? t * 2 : t * 2 - 1
      return (a ?? [0, 0, 0]).map((v, i) => Math.round(v + ((b?.[i] ?? v) - v) * k))
    }
    const history: number[] = new Array(64).fill(0)
    let raf = 0
    let last = 0
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== Math.round(w * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      if (now - last > 38) {
        last = now
        history.unshift(level.current ?? 0)
        history.pop()
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const pitch = 9
      const bars = Math.floor(w / pitch / 2) * 2 + 1
      const mid = (bars - 1) / 2
      const left = (w - (bars - 1) * pitch) / 2
      for (let i = 0; i < bars; i++) {
        const away = Math.abs(i - mid)
        // every bar has its own reach, so it reads as a voice, not a ramp
        const reach = 0.45 + 0.55 * Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1)
        const v = Math.min(
          1,
          (history[Math.min(63, Math.round(away * 1.2))] ?? 0) *
            reach *
            (1 - (away / (mid + 1)) * 0.55),
        )
        const tall = 4 + v * (h - 4)
        const [r, g, b] = colour(i / Math.max(1, bars - 1))
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.38 + 0.62 * Math.min(1, v * 3)})`
        ctx.beginPath()
        ctx.roundRect(left + i * pitch - 2, (h - tall) / 2, 4, tall, 2)
        ctx.fill()
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [level])
  // biome-ignore lint/a11y/noAriaHiddenOnFocusable: a drawing of your loudness, never focused
  return <canvas ref={ref} className="voice-stage-wave" aria-hidden="true" />
}

/* ---------- what shows of the build ---------- */

type Shown = { key: number | null; at: Record<string, number> }

/** Which parts land next: the first waiting part of every step in the lowest wave that still has
 *  one. A part that never got a value lands empty once the card is complete, so nothing can hold
 *  the close. */
function nextParts(parts: StageBuild["parts"], at: Record<string, number>, complete: boolean) {
  const hidden = parts.filter((p) => !(p.id in at))
  if (!hidden.length) return []
  const wave = Math.min(...hidden.map((p) => p.wave))
  const steps = new Set<string>()
  const out: string[] = []
  for (const p of hidden) {
    if (p.wave !== wave || steps.has(p.label)) continue
    steps.add(p.label)
    if (p.status !== "pending" || complete) out.push(p.id)
  }
  return out
}

/** The parts that have landed on the stage, each on its own beat (`partBeat`), and their values
 *  as shown (numbers counting up). */
function useReveal(build: StageBuild | null) {
  const [state, setState] = useState<Shown>({ key: null, at: {} })
  const key = build?.key ?? null
  const at = state.key === key ? state.at : {}
  const last = useRef(0)
  const [, redraw] = useState(0)
  const parts = build?.parts ?? []
  const complete = Boolean(build?.complete)
  const waitingKey = nextParts(parts, at, complete).join(" ")
  useEffect(() => {
    if (key === null || !waitingKey) return
    const due = last.current + beat("partBeat")
    const id = window.setTimeout(
      () => {
        const now = performance.now()
        last.current = now
        const ids = waitingKey.split(" ")
        setState((s) => ({
          key,
          at: { ...(s.key === key ? s.at : {}), ...Object.fromEntries(ids.map((p) => [p, now])) },
        }))
      },
      Math.max(0, due - performance.now()),
    )
    return () => window.clearTimeout(id)
  }, [key, waitingKey])

  const tickMs = beat("numberTick")
  const now = performance.now()
  const ticking = parts.some((p) => p.tick && p.id in at && now - (at[p.id] ?? 0) < tickMs)
  useEffect(() => {
    if (!ticking) return
    const raf = requestAnimationFrame(() => redraw((n) => n + 1))
    return () => cancelAnimationFrame(raf)
  })

  const shown: Record<string, PartValue> = {}
  for (const p of parts) {
    if (!(p.id in at) || p.value === null) continue
    const t =
      p.tick && typeof p.value === "number" && !still()
        ? Math.min(1, (now - (at[p.id] ?? 0)) / tickMs)
        : 1
    shown[p.id] =
      t < 1 && typeof p.value === "number" ? Math.round(p.value * (1 - (1 - t) ** 3)) : p.value
  }
  const all = parts.length > 0 && parts.every((p) => p.id in at) && !ticking
  return { shown, at, all }
}

/** Each part's own small arrival: what changed is read off the DOM (an element whose words just
 *  appeared comes up into place). Words growing as you talk, and numbers counting, don't replay. */
function useArrivals(root: RefObject<HTMLElement | null>, key: number) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new ask watches afresh
  useEffect(() => {
    const el = root.current
    if (!el) return
    const quiet = still()
    const blank = (text: string) => !text.replace(/[\s ]/g, "")
    const arrive = (target: Element) => {
      target.animate(
        quiet
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [
              { opacity: 0, translate: "0 0.5em" },
              { opacity: 1, translate: "0 0" },
            ],
        { duration: beat("partArrive"), easing: GLIDE },
      )
    }
    const watcher = new MutationObserver((records) => {
      const done = new Set<Element>()
      for (const record of records) {
        if (record.type === "characterData") {
          const target = record.target.parentElement
          const was = record.oldValue ?? ""
          const now = record.target.textContent ?? ""
          if (!target || done.has(target) || blank(now)) continue
          if (
            !blank(was) &&
            (now.startsWith(was) || was.replace(/[\d,.]/g, "") === now.replace(/[\d,.]/g, ""))
          )
            continue
          done.add(target)
          arrive(target)
          continue
        }
        for (const node of record.addedNodes) {
          const target = node instanceof Element ? node : node.parentElement
          if (!target || target === el || done.has(target) || blank(target.textContent ?? ""))
            continue
          const gone = Array.from(record.removedNodes, (n) => n.textContent ?? "").join("")
          if (
            gone &&
            !blank(gone) &&
            gone.replace(/[\d,.]/g, "") === (node.textContent ?? "").replace(/[\d,.]/g, "")
          )
            continue
          done.add(target)
          arrive(target)
        }
      }
    })
    watcher.observe(el, {
      subtree: true,
      childList: true,
      characterData: true,
      characterDataOldValue: true,
    })
    return () => watcher.disconnect()
  }, [root, key])
}

type Pos = { x: number; y: number }
function layoutPos(el: HTMLElement): Pos {
  let x = 0
  let y = 0
  for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) {
    x += n.offsetLeft
    y += n.offsetTop
  }
  return { x, y }
}

/** How much bigger than its own size the card stands on the stage. */
function stageScale(w: number, h: number) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const phone = vw <= 640
  const scale = phone
    ? Math.min((vw - 56) / w, (vh * 0.34) / h, 1.2)
    : Math.min((vw * 0.4) / w, (vh * 0.56) / h, 1.5)
  return Math.max(0.7, Math.round(scale * 100) / 100)
}

/** A slip, no card: what it is saying, the tab naming what kind of thing that is. */
function StageReplySlip({
  reply,
  onOffer,
}: {
  reply: StageReply
  onOffer?: (say: string) => void
}) {
  const { tone, tab } = replyTone(reply)
  const [head, ...more] = reply.text.split(" · ")
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: keeps a tap on the slip from ending the ask
    <div
      className="voice-two-reply"
      data-verb={reply.verb}
      data-tone={tone}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="voice-two-reply-tab">{tab}</span>
      <p className="voice-two-reply-text">{head}</p>
      {more.length > 0 && <p className="voice-two-reply-more">{more.join(" · ")}</p>}
      {reply.source && <p className="voice-two-reply-source">{reply.source}</p>}
      {reply.offers?.length ? (
        <div className="voice-two-offers">
          {reply.offers.map((offer, i) => (
            <button
              type="button"
              key={`${i}-${offer.label}`}
              className="voice-two-offer"
              onClick={() => {
                sound("tap")
                onOffer?.(offer.say)
              }}
            >
              {offer.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function StageCard({
  build,
  fly,
  asking,
  onOffer,
  next,
}: {
  build: StageBuild
  fly: RefObject<HTMLDivElement | null>
  asking: boolean
  onOffer: (say: string) => void
  /** The second card of one breath, waiting on this one. */
  next?: boolean
}) {
  const reveal = useReveal(build)
  const body = useRef<HTMLDivElement>(null)
  useArrivals(body, build.key)
  // it is dealt out of the orb: where the orb is, from where the card will stand
  useLayoutEffect(() => {
    const el = fly.current
    const stage = el?.closest<HTMLElement>(".voice-two")
    const orb = stage?.querySelector(".voice-stage-orb")
    if (!el || !stage || !orb) return
    const o = orb.getBoundingClientRect()
    const frame = stage.getBoundingClientRect()
    el.style.setProperty(
      "--deal-x",
      `${o.left + o.width / 2 - (frame.left + el.offsetLeft + el.offsetWidth / 2)}px`,
    )
    el.style.setProperty(
      "--deal-y",
      `${o.top + o.height / 2 - (frame.top + el.offsetTop + el.offsetHeight / 2)}px`,
    )
  }, [fly])
  // One continuous card: a layout move of the card or its pill is FLIPped from where it was.
  const head = useRef<HTMLElement>(null)
  const flip = useRef<{ fly: Pos; head: Pos } | null>(null)
  useLayoutEffect(() => {
    const el = fly.current
    const h = head.current
    if (!el || !h) return
    const now = { fly: layoutPos(el), head: layoutPos(h) }
    const was = flip.current
    if (was && !still() && el.closest('[data-phase="open"]')) {
      const slow = voiceSlow()
      const shift = (target: HTMLElement, from: Pos, to: Pos) => {
        const dx = from.x - to.x
        const dy = from.y - to.y
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
        target.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0px, 0px)" }],
          { duration: 360 * slow, easing: GLIDE, composite: "add" },
        )
      }
      shift(el, was.fly, now.fly)
      shift(h, was.head, now.head)
    }
    flip.current = now
  })
  const kind = build.card?.kind ?? build.kind ?? "ask"
  const size = CARD_SIZE[kind as keyof typeof CARD_SIZE] ?? CARD_SIZE.ask
  // the size is fixed by the card kind, so the card doesn't breathe as rows land
  const [scale] = useState(() => (next ? 0.86 : 1) * stageScale(size.w, size.h))
  if (!build.card) return null
  const whole = build.complete && reveal.all
  const question = build.question
  return (
    <div
      className={`voice-two-card${next ? " is-next" : ""}`}
      data-kind={kind}
      data-state={whole ? "complete" : asking ? "asking" : "skeleton"}
    >
      <header className="voice-two-kind" ref={head}>
        <b>{KIND_LABEL[build.kind ?? "ask"]}</b>
        <span className="voice-two-parts">
          {build.parts.map((p, i) => (
            <i
              key={p.id}
              style={{ "--i": i } as CSSProperties}
              data-part={p.id}
              data-status={p.status}
              data-shown={p.id in reveal.at ? "" : undefined}
              data-room={p.library ? "" : undefined}
              data-asked={asking && question && p.id.startsWith(question.field) ? "" : undefined}
              title={p.label}
            />
          ))}
        </span>
        {asking && question && <strong className="voice-two-ask">{question.ask}</strong>}
        {next && !asking && <strong className="voice-two-ask is-found">then</strong>}
      </header>
      <div className="voice-two-fly" ref={fly}>
        <svg className="voice-two-ring" aria-hidden="true">
          <rect x="1.5" y="1.5" rx="28" />
        </svg>
        <div className="voice-two-card-body" ref={body} style={{ zoom: scale }}>
          <StageCardBody card={build.card} shown={reveal.shown} parts={build.parts} size={size} />
        </div>
      </div>
      {asking && question && question.offers.length > 0 && (
        // biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: keeps a tap on an offer from ending the ask
        <div className="voice-two-offers" onClick={(e) => e.stopPropagation()}>
          <span>say it, or take one from your library</span>
          {question.offers.map((offer, i) => (
            <button
              type="button"
              key={`${i}-${offer.label}`}
              style={{ "--i": i } as CSSProperties}
              onClick={() => {
                sound("tap")
                onOffer(offer.say)
              }}
            >
              <b>{offer.label}</b>
              {offer.from && <i>from {offer.from}</i>}
            </button>
          ))}
        </div>
      )}
      {build.parts.some((p) => p.library && p.id in reveal.at) && !asking && (
        <p className="voice-two-sources">
          <i aria-hidden="true" />
          from your library
        </p>
      )}
    </div>
  )
}

/** Your words, one span each: settled words stand, the newest is live, and the words that named
 *  the thing wear your colour as a sticker. */
function StageWords({ text, live, asking }: { text: string; live: boolean; asking: boolean }) {
  const words = text.split(/\s+/).filter(Boolean)
  const intent = guessIntent(text)
  const cues: Array<[number, number]> = []
  if (intent?.cue && intent.kind !== "ask") cues.push(intent.cue)
  if (intent?.and?.cue) cues.push(intent.and.cue)
  const isCue = (i: number) => cues.some(([a, b]) => i >= a && i <= b)
  const from = Math.max(0, words.length - 18)
  return (
    <p className={`voice-two-words ${asking ? "is-asking" : ""}`}>
      {from > 0 && <span className="voice-two-word is-old">…</span>}
      {words.slice(from).map((word, k) => {
        const i = from + k
        return (
          <span
            key={i}
            className={`voice-two-word ${live && i === words.length - 1 ? "is-live" : ""} ${isCue(i) ? "is-cue" : ""}`}
          >
            {word}
          </span>
        )
      })}
    </p>
  )
}

/** The card's travel from the stage to where it lives: the stage's own card moves and shrinks
 *  onto the target, re-aimed every frame because the room may still be scrolling to it. */
function flyCard(
  card: HTMLElement,
  target: () => HTMLElement | null,
  ms: number,
  done: () => void,
) {
  const from = card.getBoundingClientRect()
  const cx = from.left + from.width / 2
  const cy = from.top + from.height / 2
  const started = performance.now()
  let raf = 0
  let over = false
  const end = () => {
    if (over) return
    over = true
    cancelAnimationFrame(raf)
    card.style.visibility = "hidden"
    const el = target()
    if (el && !still()) {
      // it takes the hit and settles, with a lime ring
      el.animate([{ scale: "1.045 0.955" }, { scale: "1" }], { duration: 360, easing: POP })
      el.animate(
        [
          { boxShadow: "0 0 0 0 var(--color-lime)" },
          { boxShadow: "0 0 0 4px var(--color-lime)", offset: 0.25 },
          { boxShadow: "0 0 0 0 transparent" },
        ],
        { duration: 1100, easing: GLIDE },
      )
    }
    done()
  }
  const frame = () => {
    const el = target()
    if (!el) return end()
    const p = Math.min(1, (performance.now() - started) / ms)
    const r = el.getBoundingClientRect()
    const tilt = Number.parseFloat(getComputedStyle(el).rotate) || 0
    const x = cx + (r.left + r.width / 2 - cx) * sway(p)
    const y = cy + (r.top + r.height / 2 - cy) * glide(p)
    const k = 1 + (Math.min(r.width / from.width, r.height / from.height) - 1) * glide(p)
    card.style.transform = `translate(${x - cx}px, ${y - cy}px) rotate(${tilt * glide(p)}deg) scale(${k})`
    card.style.opacity = String(1 - Math.max(0, (p - 0.7) / 0.3) ** 2)
    if (p < 1) raf = requestAnimationFrame(frame)
    else end()
  }
  if (still()) window.setTimeout(end, 200)
  else frame()
  return end
}

/** Owns the orb (so it can travel) and the stage. The dock gives it the voice and the orb's seat;
 *  it gets back whether the stage is up, a way to open it, and the layer to render. */
export function useVoiceStage(
  voice: Voice,
  seat: RefObject<HTMLElement | null>,
  room: {
    /** Your colour on the stage: the space's own, else violet. */
    color: string
    /** "say what you want" examples for where you are, with their recorded voice. */
    examples: StageExample[]
    /** The card landed: open what it opened (a page) once it is home. */
    onLanded?: (build: StageBuild) => void
    /** What the orb swells with when the stage is down (your voice, or Konkyo's reading). */
    orbLevel?: RefObject<number>
    /** The orb's mood when the stage is down and voice is idle (an answer working, reading). */
    orbState?: "listening" | "working"
  },
) {
  const [params] = useState(() =>
    typeof window === "undefined"
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search),
  )
  const enabled = params.get("stage") !== "0"
  const [phase, setPhase] = useState<Phase>("closed")
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  // made after hydration: the server has no orb, so the first client render must not either
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const el = document.createElement("span")
    el.className = "voice-orb-host"
    setHost(el)
  }, [])
  const slot = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const nextCard = useRef<HTMLDivElement>(null)
  const flight = useRef<() => void>(() => {})
  const voiceRef = useRef(voice)
  voiceRef.current = voice
  const roomRef = useRef(room)
  roomRef.current = room

  // the build, through the seam; one from an earlier ask is not this stage's
  const openedAt = useRef(0)
  const fed = useSyncExternalStore(watchVoiceStage, voiceStageBuild, () => null)
  const build = phase !== "closed" && fed && fed.key >= openedAt.current - 100 ? fed : null
  const buildRef = useRef(build)
  buildRef.current = build
  const question = build?.question ?? null
  const asking = Boolean(question) && voice.state === "listening"
  const reply = build?.reply ?? null

  // the stage asks for the rest: a pause doesn't end the ask while it waits for the answer; each
  // new word restarts the wait
  // biome-ignore lint/correctness/useExhaustiveDependencies: the transcript restarts the timer
  useEffect(() => {
    voiceRef.current.hold(Boolean(question))
    if (!question) return
    const id = window.setTimeout(() => {
      // walked away: the build decides (let it go, or land it with what it has)
      voiceRef.current.hold(false)
      voiceRef.current.finish("pause")
    }, beat("followUpWait") + beat("pauseQuiet"))
    return () => window.clearTimeout(id)
  }, [question, voice.transcript])

  useLayoutEffect(() => {
    if (!host) return
    seat.current?.appendChild(host)
    return () => {
      flight.current()
      host.remove()
    }
  }, [host, seat])

  // Opening: the orb changes parent to the stage and flies there from where it was in the dock,
  // growing as it goes.
  useLayoutEffect(() => {
    if (!host || phase !== "open" || !slot.current || host.parentElement === slot.current) return
    const from = boxOf(host)
    slot.current.appendChild(host)
    flight.current()
    if (still()) return
    const there = () => {
      const box = boxOf(slot.current ?? (host.parentElement as HTMLElement))
      return { ...box, w: box.w * 1.6 }
    }
    flight.current = fly(
      host,
      () => from,
      there,
      beat("stageOpen"),
      { grow: pop, press: 0.12 },
      () => {
        host.style.transform = ""
      },
    )
  }, [phase, host])

  /** Let go: the stage closes, the orb flies home and a finished card travels to where it lives.
   *  `send` true sends what was said, false throws it away, undefined leaves the voice alone. */
  const close = useCallback(
    (send?: boolean) => {
      if (phaseRef.current !== "open" || !host) return
      const v = voiceRef.current
      if (send && v.transcript.trim()) v.finish()
      else if (send === false) v.cancel()
      setPhase("closing")
      phaseRef.current = "closing"
      flight.current()
      const b = buildRef.current
      const cards = [b?.complete && b.target ? card.current : null].filter(Boolean)
      let left = 1 + cards.length
      const land = () => {
        if (--left) return
        host.style.transform = ""
        seat.current?.appendChild(host)
        if (!still()) {
          host.animate(
            [
              { scale: "1.2 0.82", translate: "0 5%" },
              { scale: "1", translate: "0 0" },
            ],
            {
              duration: 360,
              easing: POP,
            },
          )
          seat.current
            ?.closest(".action-dock")
            ?.animate(
              [{ translate: "0 0" }, { translate: "0 5px", offset: 0.3 }, { translate: "0 0" }],
              {
                duration: 360,
                easing: GLIDE,
              },
            )
        }
        document.body.classList.remove("voice-stage-up")
        setPhase("closed")
        if (b?.complete) {
          sound("place")
          roomRef.current.onLanded?.(b)
        }
      }
      let stopOrb = () => {}
      if (still() || !seat.current) window.setTimeout(land, 200)
      else {
        const from = boxOf(host)
        const s = seat.current
        stopOrb = fly(
          host,
          () => from,
          () => seatBox(s),
          beat("orbHome"),
          { grow: glide },
          land,
        )
      }
      // a FLIP still settling would hold the card's transform against the flight's
      for (const a of card.current?.getAnimations() ?? [])
        if (!(a instanceof CSSAnimation)) a.finish()
      let stopCard = () => {}
      const target = b?.target
      if (card.current && target && b?.complete) {
        const el = card.current
        // the room comes into view first (the panel opens, the wall scrolls to the card)
        target.prepare?.()
        const there = target.el()
        if (there && !target.panel) there.scrollIntoView({ block: "nearest", behavior: "smooth" })
        let tries = 0
        const begin = () => {
          if (!target.el() && tries++ < 8) {
            const id = window.setTimeout(begin, 60)
            stopCard = () => window.clearTimeout(id)
            return
          }
          stopCard = flyCard(el, target.el, beat("cardTravel"), land)
        }
        begin()
      }
      flight.current = () => {
        stopOrb()
        stopCard()
      }
    },
    [host, seat],
  )
  const closeRef = useRef(close)
  closeRef.current = close

  const open = useCallback(() => {
    if (!enabled || phaseRef.current !== "closed") return
    openedAt.current = Date.now()
    document.body.classList.add("voice-stage-up")
    setPhase("open")
  }, [enabled])

  useEffect(() => onVoiceStageRelease(() => closeRef.current()), [])

  // ---- when it lets go: the card is whole (held a beat), it failed, or nothing came of it ----
  const complete = Boolean(build?.complete)
  const failed = build?.failed ?? null
  const busy = useRef(false)
  useEffect(() => {
    if (phase !== "open") return
    if (voice.state !== "idle") busy.current = true
    if (reply && voice.state !== "listening") {
      // a slip with choices waits for a tap; otherwise it is said, then the room takes over
      if (reply.offers?.length) return
      const id = window.setTimeout(
        () => close(),
        beat(reply.verb === "answer" ? "answerSlip" : "replyHold"),
      )
      return () => window.clearTimeout(id)
    }
    if (complete) {
      const id = window.setTimeout(() => close(), beat("closeHold") + beat("partBeat") * 8)
      return () => window.clearTimeout(id)
    }
    if (failed) {
      const id = window.setTimeout(() => close(), beat("replyHold"))
      return () => window.clearTimeout(id)
    }
    if (voice.state === "idle" && busy.current && !build?.card) {
      const id = window.setTimeout(() => close(), 300)
      return () => window.clearTimeout(id)
    }
  }, [phase, complete, failed, reply, voice.state, close, build?.card])
  useEffect(() => {
    if (phase === "closed") busy.current = false
  }, [phase])

  useEffect(() => {
    if (phase !== "open") return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [phase, close])

  // `?stage=1`: open on load
  useEffect(() => {
    if (params.get("stage") !== "1") return
    void voiceRef.current.start()
    open()
  }, [params, open])

  /** A tap outside or ✓ ends the ask; the stage stays for the build. */
  const done = () => {
    if (voice.state !== "listening") {
      // nothing to wait for: the tap lets it go
      if (!build?.card || build.complete || failed) close(build?.complete ? undefined : false)
      return
    }
    if (voice.transcript.trim()) voice.finish()
    else close(false)
  }
  const takeOffer = (say: string) => {
    voice.say(`${voice.transcript} ${say}`.trim())
  }

  const listening = voice.state === "listening"
  const silent = useRef(0)
  const pinned = useRef(Number(params.get("level")))
  const level = params.has("level") ? pinned : voice.level
  const typing = Boolean(voice.problem) && listening

  const controls = (
    // biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: keeps the keys' taps from ending the ask
    <div className="voice-stage-controls" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="voice-stage-mute"
        aria-pressed={voice.muted}
        onClick={() => {
          sound("tap")
          voice.mute(!voice.muted)
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
          {voice.muted && <path className="voice-stage-slash" d="M4 4l16 16" />}
        </svg>
        <b>{voice.muted ? "unmute" : "mute"}</b>
      </button>
      <button
        type="button"
        className="voice-stage-finish"
        onClick={() => {
          sound("tap")
          done()
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
        <b>finish</b>
      </button>
    </div>
  )

  const status = voice.muted
    ? "muted"
    : listening
      ? asking
        ? "asking"
        : "listening"
      : reply
        ? reply.verb === "answer"
          ? "answering"
          : "done"
        : failed
          ? "can't"
          : complete
            ? "placing"
            : build?.kind === "ask"
              ? "answering"
              : "building"
  const state = build?.card ? (complete ? "complete" : "filling") : "waiting"
  const stage = (
    // biome-ignore lint/a11y/useKeyWithClickEvents: a tap anywhere is "done"; Escape and the stage's own keys are the keyboard way
    <div
      className={`voice-stage is-${phase === "closed" ? "calm" : orbLook()} is-two ${voice.muted ? "is-muted" : ""}`}
      data-phase={phase}
      data-mode="two"
      data-build={state}
      style={{ "--slow": voiceSlow(), "--maker": room.color } as CSSProperties}
      onClick={done}
      role="dialog"
      aria-label="Talk to Konkyo"
    >
      <div className="voice-two">
        <section className="voice-two-left">
          <div className="voice-stage-orb" ref={slot}>
            <i className="voice-stage-thump" aria-hidden="true" />
          </div>
          <div className="voice-two-bar">
            <span
              className="voice-stage-status"
              data-mood={voice.muted ? "muted" : listening ? "listening" : "working"}
            >
              <i aria-hidden="true" />
              {status}
            </span>
            {controls}
          </div>
          <div className="voice-stage-wave-wrap">
            <StageWave level={voice.muted || !listening ? silent : level} />
          </div>
          <div className="voice-two-say">
            {typing ? (
              <TypeInstead voice={voice} />
            ) : voice.transcript ? (
              <StageWords text={voice.transcript} live={listening} asking={asking} />
            ) : (
              <p className="voice-two-words is-hint is-asking">say what you want</p>
            )}
            {question && listening && (
              <div className="voice-two-ask-slip">
                <StageReplySlip reply={{ verb: "ask", text: question.ask }} />
              </div>
            )}
          </div>
        </section>
        <section className="voice-two-right" data-state={state}>
          {failed && !listening && !reply ? (
            <StageReplySlip reply={{ verb: "no", text: failed }} />
          ) : reply && !listening ? (
            <StageReplySlip
              reply={reply}
              onOffer={(say) => {
                void voice.start().then(() => voice.say(say))
              }}
            />
          ) : build?.card ? (
            <div className="voice-two-cards">
              <StageCard
                key={build.key}
                build={build}
                fly={card}
                asking={asking}
                onOffer={takeOffer}
              />
              {build.next?.card && (
                <StageCard
                  key={`${build.key}-next`}
                  build={build.next}
                  fly={nextCard}
                  asking={false}
                  onOffer={takeOffer}
                  next
                />
              )}
            </div>
          ) : (
            !voice.transcript &&
            listening &&
            room.examples.length > 0 && (
              // biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: keeps a tap on an example from ending the ask
              <div className="voice-two-try" onClick={(e) => e.stopPropagation()}>
                <span>or tap one to hear it said</span>
                {room.examples.slice(0, 4).map((example, i) => (
                  <button
                    type="button"
                    key={example.say}
                    style={{ "--i": i } as CSSProperties}
                    onClick={() => {
                      sound("tap")
                      void voice.play(example.clip ?? example.say)
                    }}
                  >
                    <i aria-hidden="true" />
                    {example.say}
                  </button>
                ))}
              </div>
            )
          )}
        </section>
      </div>
    </div>
  )

  const layer: ReactNode = host ? (
    <>
      {createPortal(
        <VoiceOrb
          state={
            voice.muted
              ? "idle"
              : phase === "closed" && voice.state === "idle"
                ? (room.orbState ?? "idle")
                : voice.state
          }
          level={phase === "closed" && room.orbLevel ? room.orbLevel : level}
          stage={phase === "open"}
        />,
        host,
      )}
      {phase !== "closed" && createPortal(stage, document.body)}
    </>
  ) : null

  return { up: phase !== "closed", open, close, layer }
}

/** No mic (refused, or voice is resting): the words area takes typing, Enter asks. */
function TypeInstead({ voice }: { voice: Voice }) {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    voice.hold(true)
    input.current?.focus()
    return () => voice.hold(false)
  }, [voice])
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: keeps a tap in the field from ending the ask
    <div className="voice-two-type" onClick={(e) => e.stopPropagation()}>
      <p className="voice-two-type-why">{voice.problem} · type it instead</p>
      <input
        ref={input}
        className="voice-two-words voice-two-type-input"
        value={voice.transcript}
        onChange={(event) => voice.type(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && voice.transcript.trim()) {
            voice.hold(false)
            voice.finish("done")
          }
        }}
        placeholder="ask your sources…"
        aria-label="Your question"
      />
    </div>
  )
}

/** The words hang mid-thought: re-exported for the dock strip's own pause. */
export { sentenceHangs }

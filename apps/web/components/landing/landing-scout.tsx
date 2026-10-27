"use client"

import { useEffect, useState } from "react"
import type { ScoutInput, ScoutSource } from "@/lib/scout"
import { ScoutCanvas } from "../scout/scout-canvas"

/** Real papers on sleep and memory, the landing's own subject (the sample space is about it). */
const SOURCES: ScoutSource[] = [
  "Daytime naps, motor memory consolidation and regionally specific sleep spindles",
  "The memory function of sleep",
  "About sleep's role in memory",
  "Sleep-dependent memory consolidation",
  "Practice with sleep makes perfect: sleep-dependent motor skill learning",
  "Sleep inspires insight",
  "The role of sleep in learning and memory",
  "Sleep and synaptic homeostasis: a hypothesis",
  "Sleep spindle activity is associated with the integration of new memories and existing knowledge",
  "Sleep promotes the extraction of grammatical rules",
  "The role of sleep in cognition and emotion",
  "Sleep and the time course of motor skill learning",
  "Sleep-dependent learning and memory consolidation",
].map((title, i) => ({ key: `p${i}`, kind: "paper", title, detail: "" }))

/** The ones a screening keeps. */
const KEPT = new Set(["p0", "p1", "p2", "p3", "p6", "p8"])

const EMPTY: ScoutInput = { found: [], phase: "plan", screening: null, shortlist: null, steers: 0 }
const FINAL: ScoutInput = { ...EMPTY, found: SOURCES, phase: "hold", shortlist: KEPT }

/**
 * One deep search, start to finish, as a list of moments: plan, find the papers (a quick few,
 * then a steady trickle), screen them in three passes, then the shortlist closes. After a
 * pause it starts again.
 */
function script() {
  const frames: { at: number; input: ScoutInput }[] = [{ at: 0, input: EMPTY }]
  let t = 3200
  frames.push({ at: t, input: { ...EMPTY, phase: "search" } })
  t += 600
  SOURCES.forEach((_, i) => {
    frames.push({
      at: t,
      input: { ...EMPTY, phase: "search", found: SOURCES.slice(0, i + 1) },
    })
    t += i < 5 ? 350 : 800
  })
  t += 900
  for (const [step, kept] of [
    [1, 9],
    [2, 7],
    [3, KEPT.size],
  ] as const) {
    frames.push({
      at: t,
      input: { ...EMPTY, found: SOURCES, phase: "screen", screening: { step, of: 3, kept } },
    })
    t += 1700
  }
  frames.push({ at: t, input: FINAL })
  return { frames, total: t + 6500 }
}

const SCRIPT = script()

/** The search, played on a loop: what the scout is doing now, and which pass of the loop it is. */
function useScoutScript() {
  const [epoch, setEpoch] = useState(0)
  const [input, setInput] = useState<ScoutInput>(EMPTY)
  // biome-ignore lint/correctness/useExhaustiveDependencies: each new epoch plays the script again
  useEffect(() => {
    // Someone who asked for less motion gets the finished picture, still.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setInput(FINAL)
      return
    }
    const timers = SCRIPT.frames.map((f) => setTimeout(() => setInput(f.input), f.at))
    timers.push(setTimeout(() => setEpoch((e) => e + 1), SCRIPT.total))
    return () => {
      for (const timer of timers) clearTimeout(timer)
    }
  }, [epoch])
  return { input, epoch }
}

/**
 * The landing's scout: the deep search's waiting room, played on real papers so a visitor sees
 * what the wait is before they sign in. It runs in a loop and rests when it is off screen.
 */
export function LandingScout() {
  const { input, epoch } = useScoutScript()
  return (
    <figure className="about-crawl-stage">
      <ScoutCanvas input={input} epoch={epoch} className="h-72 sm:h-80" />
      <figcaption>
        An example, replayed: thirteen real papers on sleep and memory. In Konkyo the scout runs on
        your question, and every source it stamps is one it found.
      </figcaption>
    </figure>
  )
}

/** The same search, behind the hero: no box, fading into the page, the pointer still tempting it. */
export function HeroScout() {
  const { input, epoch } = useScoutScript()
  return <ScoutCanvas input={input} epoch={epoch} ambient className="size-full" />
}

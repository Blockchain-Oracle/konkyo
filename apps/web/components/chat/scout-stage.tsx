"use client"

import type { DeepState } from "@konkyo/agents/deep"
import { cn } from "@konkyo/ui/lib/utils"
import { useEffect, useRef } from "react"
import { createScout, type Scout, type ScoutInput, type ScoutPhase } from "@/lib/scout"

/** Where the run is, as the scout understands it. */
function phaseOf(state: DeepState): ScoutPhase {
  if (state.approved) return "import"
  if (state.shortlist) return "hold"
  const id = (state.stages.find((s) => s.state === "running") ?? state.stages.at(-1))?.id
  return id === "search" ? "search" : id === "screen" ? "screen" : "plan"
}

const toInput = (state: DeepState): ScoutInput => ({
  found: state.found,
  phase: phaseOf(state),
  screening: state.screening ?? null,
  shortlist: state.shortlist ? new Set(state.shortlist.candidates.map((c) => c.key)) : null,
  steers: state.steers.length,
})

/**
 * The deep search's waiting room: a spider that crawls the sources as they're found. The look
 * and the walking live in `lib/scout.ts`; this feeds it the run's state, keeps its pixels the
 * size of the box, and pauses it while it's off screen. Move the pointer over it and the spider
 * comes to see, once it has nothing left to read.
 */
export function ScoutStage({ state, className }: { state: DeepState; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const scout = useRef<Scout | null>(null)

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const made = createScout(el)
    if (!made) return
    scout.current = made
    made.resize()
    const sized = new ResizeObserver(() => made.resize())
    sized.observe(el)
    const seen = new IntersectionObserver(([entry]) => made.play(entry?.isIntersecting ?? true))
    seen.observe(el)
    return () => {
      sized.disconnect()
      seen.disconnect()
      made.destroy()
      scout.current = null
    }
  }, [])

  useEffect(() => {
    scout.current?.set(toInput(state))
  }, [state])

  return (
    <div
      className={cn(
        "relative h-44 overflow-hidden rounded-card border border-border bg-sticker sm:h-56",
        className,
      )}
      onPointerMove={(e) => {
        const box = e.currentTarget.getBoundingClientRect()
        scout.current?.pointer(e.clientX - box.left, e.clientY - box.top)
      }}
      onPointerLeave={() => scout.current?.pointer(null)}
    >
      <canvas ref={canvas} aria-hidden className="absolute inset-0 size-full font-mono" />
    </div>
  )
}

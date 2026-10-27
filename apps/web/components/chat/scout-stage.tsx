"use client"

import type { DeepState } from "@konkyo/agents/deep"
import { cn } from "@konkyo/ui/lib/utils"
import { useMemo } from "react"
import type { ScoutInput, ScoutPhase } from "@/lib/scout"
import { ScoutCanvas } from "../scout/scout-canvas"

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
 * The deep search's waiting room: a spider that crawls the sources as they're found, from the
 * run's own events.
 */
export function ScoutStage({ state, className }: { state: DeepState; className?: string }) {
  const input = useMemo(() => toInput(state), [state])
  return <ScoutCanvas input={input} className={cn("h-44 sm:h-56", className)} />
}

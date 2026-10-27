"use client"

import type { Matrix, SourceRef, StepData } from "@konkyo/agents"
import { useMemo } from "react"
import type { ScoutInput, ScoutSource, ScoutTone } from "@/lib/scout"
import { ScoutCanvas } from "../scout/scout-canvas"

/** One node per source file, in the order its passages came; a comparison adds its own sources. */
function sourcesOf(sources: SourceRef[], matrix?: Matrix): ScoutSource[] {
  const out = new Map<string, ScoutSource>()
  const add = (fileId: string, title: string, kind: string, detail?: string) => {
    if (!out.has(fileId))
      out.set(fileId, {
        key: fileId,
        kind: kind === "web" ? "web" : "paper",
        title,
        detail: detail ?? "",
      })
  }
  for (const s of sources) add(s.fileId, s.title, s.kind, s.byline)
  for (const s of matrix?.sources ?? []) add(s.fileId, s.title, s.kind, s.byline)
  return [...out.values()]
}

/** Where each source stands across the comparison's claims: all agree, all disagree, or mixed. */
function tonesOf(matrix?: Matrix): Map<string, ScoutTone> | null {
  if (!matrix) return null
  const tally = new Map<string, { agrees: number; disagrees: number; partly: number }>()
  for (const claim of matrix.claims)
    for (const cell of claim.cells) {
      const t = tally.get(cell.fileId) ?? { agrees: 0, disagrees: 0, partly: 0 }
      t[cell.stance] += 1
      tally.set(cell.fileId, t)
    }
  const tones = new Map<string, ScoutTone>()
  for (const [fileId, t] of tally)
    tones.set(
      fileId,
      t.disagrees && !t.agrees && !t.partly
        ? "disagrees"
        : t.agrees && !t.disagrees && !t.partly
          ? "agrees"
          : "partly",
    )
  return tones
}

/** What the corner of the stage says: the step in hand, or a comparison's real tally. */
function captionOf(active: StepData | undefined, matrix?: Matrix) {
  if (matrix?.state === "done") {
    const c = matrix.counts
    return `${c.agree} agree · ${c.disagree} disagree · ${c.partly} partly`
  }
  return active ? active.label.toLowerCase() : "planning"
}

/** The run's steps, as the scout sees them: planning, then reading, then checking. */
function inputOf(steps: StepData[], sources: SourceRef[], matrix?: Matrix): ScoutInput {
  const active = [...steps].reverse().find((s) => s.state === "running") ?? steps.at(-1)
  const id = active?.id
  return {
    found: sourcesOf(sources, matrix),
    // The passages arrive just before the Writer starts, so reading them is the crawl; the
    // Verifier checking each quote is the sweep.
    phase: !id || id === "plan" ? "plan" : id === "verify" ? "screen" : "search",
    screening: null,
    shortlist: null,
    steers: 0,
    caption: captionOf(active, matrix),
    tones: tonesOf(matrix),
  }
}

/**
 * The wait on an ordinary answer (Whole library, one space or Compare): the same scout as deep
 * search, driven by what this answer is really doing. It plans while the library is searched,
 * crawls the passages it was given as the Writer reads them, sweeps as each quote is checked, and
 * on a comparison each source takes the colour of where it stands.
 */
export function ScoutAnswer({
  steps,
  sources,
  matrix,
}: {
  steps: StepData[]
  sources: SourceRef[]
  matrix?: Matrix
}) {
  const input = useMemo(() => inputOf(steps, sources, matrix), [steps, sources, matrix])
  return <ScoutCanvas input={input} className="mb-4 h-36 sm:h-44" />
}

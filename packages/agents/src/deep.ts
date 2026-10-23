// Deep search (plan F18–F19): the events a run writes and the state the run view rebuilds from
// them. Types and pure functions only, so the browser imports this file directly.
import type { AnswerEvent } from "./answer"
import type { ScreeningReport } from "./scout"
import type { KonkyoMessage, StepData } from "./ui"

/** A source as the run view lists it. */
export type FoundSummary = {
  key: string
  kind: "paper" | "web"
  title: string
  /** "Author et al. · 2021 · Journal" or the site. */
  detail: string
}

/** A shortlisted source, with why the Screener kept it. */
export type DeepCandidate = FoundSummary & { why: string; score: number; url?: string }

export type DeepStageId = "plan" | "search" | "screen" | "approve" | "import" | "answer"

export type DeepEvent =
  | { type: "stage"; id: DeepStageId; label: string; state: StepData["state"]; detail?: string }
  | { type: "found"; source: FoundSummary }
  | { type: "screened"; step: number; of: number; kept: number }
  | {
      type: "shortlist"
      candidates: DeepCandidate[]
      folderName: string
      report: ScreeningReport
      /** Imported without asking (the person's setting). */
      auto: boolean
    }
  | { type: "approved"; keys: string[]; folderName: string; folderId: string }
  | {
      type: "file"
      key: string
      fileId: string
      title: string
      status: string
      stage?: string
      progress?: number
      problem?: string
    }
  | { type: "answer"; event: AnswerEvent }
  | { type: "steer"; text: string }
  | {
      type: "end"
      status: "answered" | "not-found" | "nothing-found" | "failed" | "stopped"
      message?: string
    }

export type DeepFile = Extract<DeepEvent, { type: "file" }>

export type DeepState = {
  stages: StepData[]
  found: FoundSummary[]
  screening?: { step: number; of: number; kept: number }
  shortlist?: Extract<DeepEvent, { type: "shortlist" }>
  approved?: Extract<DeepEvent, { type: "approved" }>
  files: DeepFile[]
  answer: AnswerEvent[]
  steers: string[]
  end?: Extract<DeepEvent, { type: "end" }>
}

export const emptyDeep = (): DeepState => ({
  stages: [],
  found: [],
  files: [],
  answer: [],
  steers: [],
})

/** One event into the state (the run view replays every event in order, so this is pure). */
export function reduceDeep(state: DeepState, event: DeepEvent): DeepState {
  switch (event.type) {
    case "stage": {
      const step: StepData = {
        id: event.id,
        label: event.label,
        state: event.state,
        detail: event.detail,
      }
      const at = state.stages.findIndex((s) => s.id === event.id)
      const stages =
        at === -1 ? [...state.stages, step] : state.stages.map((s, i) => (i === at ? step : s))
      return { ...state, stages }
    }
    case "found":
      return state.found.some((f) => f.key === event.source.key)
        ? state
        : { ...state, found: [...state.found, event.source] }
    case "screened":
      return { ...state, screening: event }
    case "shortlist":
      return { ...state, shortlist: event }
    case "approved":
      return { ...state, approved: event }
    case "file": {
      const at = state.files.findIndex((f) => f.key === event.key)
      return {
        ...state,
        files:
          at === -1 ? [...state.files, event] : state.files.map((f, i) => (i === at ? event : f)),
      }
    }
    case "answer":
      return { ...state, answer: [...state.answer, event.event] }
    case "steer":
      return { ...state, steers: [...state.steers, event.text] }
    case "end":
      return { ...state, end: event }
  }
}

/**
 * An answer's events as the message parts a chat answer saves (steps, sources, the verified
 * answer, matrix, receipt), plus the streamed draft while it's still being written. The deep
 * run's answer is then read, copied, exported and rated like any other.
 */
export function answerParts(events: AnswerEvent[], withDraft = false): KonkyoMessage["parts"] {
  const steps = new Map<string, StepData>()
  const parts: KonkyoMessage["parts"] = []
  let draft = ""
  let sources: Extract<AnswerEvent, { type: "sources" }> | undefined
  let final: Extract<AnswerEvent, { type: "final" }> | undefined
  let matrix: Extract<AnswerEvent, { type: "matrix" }> | undefined
  let receipt: Extract<AnswerEvent, { type: "receipt" }> | undefined
  let notFound: Extract<AnswerEvent, { type: "not-found" }> | undefined
  for (const e of events) {
    if (e.type === "step")
      steps.set(e.id, { id: e.id, label: e.label, state: e.state, detail: e.detail })
    else if (e.type === "text") draft += e.delta
    else if (e.type === "sources") sources = e
    else if (e.type === "final") final = e
    else if (e.type === "matrix") matrix = e
    else if (e.type === "receipt") receipt = e
    else if (e.type === "not-found") notFound = e
  }
  for (const step of steps.values())
    parts.push({ type: "data-step", id: `step-${step.id}`, data: step })
  if (sources)
    parts.push({ type: "data-sources", id: "sources", data: { sources: sources.sources } })
  if (withDraft && draft && !final) parts.push({ type: "text", text: draft })
  if (final)
    parts.push({
      type: "data-final",
      id: "final",
      data: {
        body: final.body,
        caveat: final.caveat,
        citations: final.citations,
        rewritten: final.rewritten,
      },
    })
  if (matrix) parts.push({ type: "data-matrix", id: "matrix", data: matrix.matrix })
  if (notFound)
    parts.push({ type: "data-notFound", id: "not-found", data: { question: notFound.question } })
  if (receipt) parts.push({ type: "data-receipt", id: "receipt", data: receipt.receipt })
  return parts
}

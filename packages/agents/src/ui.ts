import type { UIMessage } from "ai"
import type { Matrix } from "./analyst"
import type { Citation, Receipt, SourceRef } from "./answer"

/** An agent step as the chat shows it live; one part per step, updated in place. */
export type StepData = {
  id: string
  label: string
  state: "running" | "done" | "failed"
  detail?: string
}

/** The data parts of an answer message (AI SDK UI message parts named `data-<key>`). */
export type KonkyoData = {
  step: StepData
  /** The passages the Writer was given (p1…pN), sent before it starts writing. */
  sources: { sources: SourceRef[] }
  /** The verified answer: replaces the streamed draft once the Verifier is done. */
  final: { body: string; caveat?: string; citations: Citation[]; rewritten: string[] }
  receipt: Receipt
  notFound: { question: string; tried?: string[] }
  /** Claims × sources with stance (F13), streamed "checking" then verified. */
  matrix: Matrix
  revising: { round: number; reasons: string[] }
  /** A deep search answering this (F18): its progress streams from the run's events. */
  deep: { runId: string; question: string }
  /** On a question: the passage it is about (selection toolbar "Ask"). */
  quote: { fileId: string; title: string; page?: number; text: string }
}

export type KonkyoMetadata = { runId?: string; createdAt?: string; feedback?: "up" | "down" }
export type KonkyoMessage = UIMessage<KonkyoMetadata, KonkyoData>

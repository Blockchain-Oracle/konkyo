import { appendFile, mkdir } from "node:fs/promises"
import path from "node:path"

/**
 * One line per agent step in `logs/<runId>.jsonl` (plan §2 "Traces"): the record judges and
 * developers read to see which agent did what, with which model, against which source, and why.
 */
export type TraceEvent = {
  ts: string
  runId: string
  agent: "planner" | "retriever" | "analyst" | "writer" | "verifier" | "scout" | "system"
  step: string
  action: string
  model?: string
  toolCalls?: string[]
  sqlHash?: string
  rowsReturned?: number
  verdict?: string
  latencyMs?: number
  tokens?: { input?: number; output?: number }
  detail?: Record<string, unknown>
}

const LOGS_DIR = process.env.KONKYO_LOGS_DIR ?? path.resolve(process.cwd(), "logs")

export class Tracer {
  private ready: Promise<unknown>
  private queue: Promise<unknown> = Promise.resolve()
  readonly events: TraceEvent[] = []
  readonly file: string

  constructor(
    readonly runId: string,
    private onEvent?: (event: TraceEvent) => void,
  ) {
    this.file = path.join(LOGS_DIR, `${runId}.jsonl`)
    this.ready = mkdir(LOGS_DIR, { recursive: true })
  }

  log(event: Omit<TraceEvent, "ts" | "runId">) {
    const full: TraceEvent = { ts: new Date().toISOString(), runId: this.runId, ...event }
    this.events.push(full)
    this.onEvent?.(full)
    // Appends in order, never blocking the run; a failed write never fails an answer.
    this.queue = this.queue
      .then(() => this.ready)
      .then(() => appendFile(this.file, `${JSON.stringify(full)}\n`))
      .catch((error: Error) => console.warn(`[trace] ${this.runId}: ${error.message}`))
    return full
  }

  /** Waits for every line to reach the file (call before the run ends). */
  flush() {
    return this.queue
  }
}

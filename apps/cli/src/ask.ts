import { randomUUID } from "node:crypto"
import { copyFile, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { type AnswerEvent, answer, type Scope, Tracer } from "@konkyo/agents"
import { saveRecording, startRecording, startReplay } from "@konkyo/tape"
import type { Example } from "./examples"
import { collector, json, MARKDOWN, PLAIN, type Run, render, TERMINAL } from "./print"

type Options = {
  root: string
  question: string
  ownerId: string
  scope: Scope
  folder?: string
  compare?: boolean
  json?: boolean
  /** Record this run's outside replies into examples/<name>/. */
  record?: { name: string; about?: string }
  /** Replay a recorded example instead of calling the services. */
  sample?: Example
}

const tty = process.stderr.isTTY
const progress = (line: string) => process.stderr.write(`${line}\n`)

/** Prints each step once it settles, the way the chat shows them. */
function onStep(event: AnswerEvent) {
  if (event.type === "step" && event.state !== "running") {
    const mark = event.state === "done" ? "✓" : "✗"
    const detail = event.detail ? ` · ${event.detail}` : ""
    progress(`  ${mark} ${event.label}${tty ? `\x1b[2m${detail}\x1b[0m` : detail}`)
  } else if (event.type === "revising") {
    progress(
      `  ↺ The Verifier sent back ${event.reasons.length} sentence${event.reasons.length === 1 ? "" : "s"}; rewriting (round ${event.round})`,
    )
  }
}

/**
 * One question through the same pipeline the chat runs (plan §3): Planner, Retriever, Zetaris
 * pre-check, Writer, Verifier with rewrites, the Analyst's matrix; the trace in logs/.
 */
export async function ask(options: Options) {
  const { root } = options
  const mode = options.sample ? "sample" : "live"
  let { question, scope, compare } = options
  let recordedMs: number | undefined
  if (options.sample) {
    // The recorded run's own question, scope and mode, so every request matches the tape.
    const meta = await startReplay(path.join(options.sample.dir, "tape.jsonl"))
    question = meta.question
    scope = meta.scope ?? {}
    compare = meta.compare
    recordedMs = meta.tookMs
    progress(
      `Sample mode: replaying the replies Nemotron, Zetaris and the library search gave on ${options.sample.recordedAt.slice(0, 10)}.\nNo keys and no services: every agent step below runs again on those replies.\n`,
    )
  } else if (options.record) {
    startRecording({ question, recordedAt: new Date().toISOString(), scope, compare })
  }

  const runId = randomUUID()
  const tracer = new Tracer(runId)
  const { run, onEvent } = collector()
  const stop = new AbortController()
  process.once("SIGINT", () => stop.abort())
  progress(question)
  const result = await answer({
    ownerId: options.ownerId,
    question,
    history: [],
    scope,
    compare,
    tracer,
    abortSignal: stop.signal,
    emit: (event) => {
      onStep(event)
      onEvent(event)
    },
  })
  await tracer.flush()

  const done: Run = {
    ...run,
    question,
    mode,
    status: result.status === "not-found" ? "not-found" : "answered",
    runId,
    // Relative to the repository when it's inside it; absolute otherwise (KONKYO_ROOT elsewhere).
    trace: path.relative(root, tracer.file).startsWith("..")
      ? tracer.file
      : path.relative(root, tracer.file),
    traceEvents: tracer.events.length,
    recordedMs,
  }
  process.stdout.write(
    options.json
      ? `${JSON.stringify(json(done), null, 2)}\n`
      : `\n${render(done, process.stdout.isTTY ? TERMINAL : PLAIN)}\n`,
  )

  if (options.record) {
    const dir = path.join(root, "examples", options.record.name)
    await mkdir(dir, { recursive: true })
    const replies = await saveRecording(path.join(dir, "tape.jsonl"), {
      tookMs: done.receipt?.totalMs,
    })
    await copyFile(tracer.file, path.join(dir, "trace.jsonl"))
    const recorded = { ...done, trace: `examples/${options.record.name}/trace.jsonl` }
    await writeFile(path.join(dir, "output.md"), `${render(recorded, MARKDOWN)}\n`)
    await writeFile(
      path.join(dir, "input.json"),
      `${JSON.stringify(
        {
          question,
          folder: options.folder,
          about: options.record.about,
          recordedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
    )
    progress(`\nRecorded ${replies} outside replies to examples/${options.record.name}/`)
  }
  return done
}

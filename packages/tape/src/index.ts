import { AsyncLocalStorage } from "node:async_hooks"
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

/**
 * Record and replay (plan S09, sample mode). A real run records what came back across each outside
 * boundary: the model APIs' HTTP replies (OpenAI, Nemotron), the rows of each Zetaris statement,
 * the library search and the H-MEM recall. A replay hands those same bytes back instead of calling
 * the services, while every line of Konkyo's own logic (planning, citation parsing, the quote
 * checks, the Verifier's rewrites, the matrix, the World Model, the trace) runs again. Off unless
 * the CLI turns it on: in the web app and the worker every wrapper calls straight through.
 */

export type TapeMeta = {
  question: string
  recordedAt: string
  scope?: { fileIds?: string[]; folderIds?: string[] }
  /** The run weighed its sources against each other whatever the Planner said. */
  compare?: boolean
  /** How long the recorded run took (a replay's own timings are only the replay's). */
  tookMs?: number
}

type Entry = { kind: string; key: string; value: unknown }
type State = { mode: "record" | "replay"; meta: TapeMeta; entries: Entry[]; used: Set<number> }

let state: State | null = null
/** Set inside a recorded call: what it calls in turn is part of that reply, not recorded again. */
const inside = new AsyncLocalStorage<true>()

/** A replay asked for something the recording doesn't have: a different question or code path. */
export class TapeMiss extends Error {
  constructor(kind: string) {
    super(
      `The recording has no ${kind} reply for this step. Sample mode replays recorded runs only: ask one of the recorded questions, or run without --sample.`,
    )
    this.name = "TapeMiss"
  }
}

const hash = (value: unknown) =>
  createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex")
    .slice(0, 20)

export function startRecording(meta: TapeMeta) {
  state = { mode: "record", meta, entries: [], used: new Set() }
}

/** A tape is JSON Lines: the run's question first, then one recorded reply per line. */
export async function saveRecording(file: string, extra: Partial<TapeMeta> = {}) {
  if (state?.mode !== "record") throw new Error("Not recording")
  Object.assign(state.meta, extra)
  await mkdir(path.dirname(file), { recursive: true })
  const lines = [state.meta, ...state.entries].map((line) => JSON.stringify(line))
  await writeFile(file, `${lines.join("\n")}\n`)
  return state.entries.length
}

export async function startReplay(file: string): Promise<TapeMeta> {
  const [first, ...rest] = (await readFile(file, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  state = { mode: "replay", meta: first as TapeMeta, entries: rest as Entry[], used: new Set() }
  return state.meta
}

export const tapeMode = () => state?.mode ?? null

/** The first unused reply for this boundary and request (concurrent calls may come in any order). */
function take(kind: string, key: string) {
  if (!state) throw new Error("No tape")
  const tape = state
  const i = tape.entries.findIndex((e, n) => !tape.used.has(n) && e.kind === kind && e.key === key)
  if (i < 0) throw new TapeMiss(kind)
  tape.used.add(i)
  return (tape.entries[i] as Entry).value
}

/**
 * Wraps a boundary function. `keyOf` names what identifies the request (never the person's id,
 * so a replay works for any owner); the result must be plain JSON.
 */
export function taped<A extends unknown[], R>(
  kind: string,
  fn: (...args: A) => Promise<R>,
  keyOf: (...args: NoInfer<A>) => unknown = (...args) => args,
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    if (!state || inside.getStore()) return fn(...args)
    const key = hash(keyOf(...args))
    if (state.mode === "replay") return take(kind, key) as R
    const value = await inside.run(true, () => fn(...args))
    state.entries.push({ kind, key, value: JSON.parse(JSON.stringify(value ?? null)) })
    return value
  }
}

type HttpReply = { path: string; status: number; contentType: string; body: string }

/** Replays a recorded body in its server-sent events, so a stream arrives as a stream. */
function replayBody(text: string) {
  const encoder = new TextEncoder()
  const parts = text.split(/(?<=\n\n)/)
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part))
      controller.close()
    },
  })
}

/**
 * `fetch` for a model provider: records each reply's status, type and body (never request
 * headers, so no key is written), keyed by method, path and request body.
 */
export const tapedFetch: typeof fetch = async (input, init) => {
  if (!state || inside.getStore()) return fetch(input, init)
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url)
  const method = init?.method ?? "GET"
  const body = typeof init?.body === "string" ? init.body : ""
  const key = hash(`${method} ${url.pathname} ${body}`)
  if (state.mode === "replay") {
    const reply = take("http", key) as HttpReply
    return new Response(replayBody(reply.body), {
      status: reply.status,
      headers: { "content-type": reply.contentType },
    })
  }
  const res = await fetch(input, init)
  const text = await res.text()
  const reply: HttpReply = {
    path: url.pathname,
    status: res.status,
    contentType: res.headers.get("content-type") ?? "",
    body: text,
  }
  state.entries.push({ kind: "http", key, value: reply })
  // The body was already decoded, so its encoding and length headers no longer apply.
  const headers = new Headers(res.headers)
  headers.delete("content-encoding")
  headers.delete("content-length")
  return new Response(text, { status: res.status, statusText: res.statusText, headers })
}

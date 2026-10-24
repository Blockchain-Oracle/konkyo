import type { AnswerEvent, Matrix, Receipt } from "@konkyo/agents"

type Final = Extract<AnswerEvent, { type: "final" }>

/** Everything one run said, gathered from its events. */
export type Run = {
  question: string
  mode: "live" | "sample"
  status: "answered" | "not-found"
  final?: Final
  matrix?: Matrix
  receipt?: Receipt
  revisions: { round: number; reasons: string[] }[]
  runId: string
  /** The trace, relative to the repo root. */
  trace: string
  traceEvents: number
  /** Sample mode: how long the recorded run took. */
  recordedMs?: number
}

export function collector() {
  const run: Omit<Run, "question" | "mode" | "status" | "runId" | "trace" | "traceEvents"> = {
    revisions: [],
  }
  const onEvent = (event: AnswerEvent) => {
    if (event.type === "final") run.final = event
    else if (event.type === "matrix" && event.matrix.state === "done") run.matrix = event.matrix
    else if (event.type === "receipt") run.receipt = event.receipt
    else if (event.type === "revising")
      run.revisions.push({ round: event.round, reasons: event.reasons })
  }
  return { run, onEvent }
}

type Style = {
  heading: (s: string) => string
  dim: (s: string) => string
  quote: (s: string) => string
}

const ansi = (code: string) => (s: string) => `\x1b[${code}m${s}\x1b[0m`
export const TERMINAL: Style = {
  heading: ansi("1"),
  dim: ansi("2"),
  quote: ansi("3"),
}
export const PLAIN: Style = { heading: (s) => s, dim: (s) => s, quote: (s) => s }
export const MARKDOWN: Style = {
  heading: (s) => `## ${s}`,
  dim: (s) => `_${s}_`,
  quote: (s) => s,
}

const where = (page: number | null, tStart: number | null) =>
  page != null
    ? `p. ${page}`
    : tStart != null
      ? `${Math.floor(tStart / 60)}:${String(Math.floor(tStart % 60)).padStart(2, "0")}`
      : ""

const sourceName = (title: string, byline?: string) => (byline ? `${byline}, ${title}` : title)

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

const STANCE = { agrees: "agrees", disagrees: "disagrees", partly: "partly" } as const

/** The answer, its sources and checks, as the app shows them, in text. */
export function render(run: Run, style: Style) {
  const out: string[] = []
  const md = style === MARKDOWN
  out.push(md ? `# ${run.question}` : style.heading(run.question), "")

  if (run.status === "not-found" || !run.final) {
    out.push(
      "Not in your library. Konkyo answers only from your sources, and none of them covers this.",
      style.dim("In the app, Find sources searches the web and scholarly databases for papers."),
    )
  } else {
    const { body, caveat, citations } = run.final
    out.push(body.trim(), "")
    if (caveat) out.push(`${md ? "**Caveat:**" : "Caveat:"} ${caveat}`, "")
    out.push(
      style.heading(`Sources (${citations.length})`),
      style.dim("Each quote was found word for word in Zetaris's own reading of the source."),
      "",
    )
    for (const c of citations) {
      const place = where(c.page, c.tStart)
      out.push(
        `${md ? "- " : ""}[${c.n}] ${sourceName(c.title, c.byline)}${place ? `, ${place}` : ""}${
          c.state === "rewritten"
            ? ` ${style.dim("(sentence rewritten after the Verifier's check)")}`
            : ""
        }`,
        `${md ? "  > " : "    "}${style.quote(`“${c.quote}”`)}`,
      )
    }
  }

  if (run.revisions.length) {
    out.push("", style.heading("What the Verifier sent back"))
    for (const r of run.revisions)
      for (const reason of r.reasons) out.push(`${md ? "- " : "  "}Round ${r.round}: ${reason}`)
  }

  if (run.matrix?.claims.length) {
    const m = run.matrix
    out.push(
      "",
      style.heading(
        `Where the sources agree and differ (${plural(m.counts.claims, "claim")}, ${plural(m.counts.sources, "source")})`,
      ),
    )
    for (const claim of m.claims) {
      out.push(`${md ? "- " : "• "}${claim.text}`)
      for (const cell of claim.cells) {
        const source = m.sources.find((s) => s.fileId === cell.fileId)
        const place = where(cell.page, cell.tStart)
        out.push(
          `${md ? "  - " : "    "}${STANCE[cell.stance].padEnd(md ? 0 : 9)} ${
            source ? sourceName(source.title, source.byline) : "a source"
          }${place ? `, ${place}` : ""}: ${style.quote(`“${cell.quote}”`)}`,
        )
      }
    }
  }

  if (run.receipt) {
    const r = run.receipt
    out.push(
      "",
      style.heading("Checks"),
      `${md ? "- " : ""}${r.quotes} quote${r.quotes === 1 ? "" : "s"} from ${r.sources} source${
        r.sources === 1 ? "" : "s"
      } checked in one Zetaris statement (${r.verifyMs} ms); ${r.rewritten} rewritten, ${r.dropped} dropped; ${(
        r.totalMs / 1000
      ).toFixed(1)} s in all${
        run.recordedMs != null
          ? ` (replayed; the recorded run took ${(run.recordedMs / 1000).toFixed(1)} s)`
          : ""
      }.`,
      `${md ? "- " : ""}Models: ${Object.entries(r.models)
        .map(([role, id]) => `${role} ${id}`)
        .join(", ")}.`,
    )
    if (r.memories.length)
      out.push(
        `${md ? "- " : ""}Read from memory (H-MEM): ${r.memories.map((m) => `“${m.content}”`).join("; ")}`,
      )
    if (r.analyst)
      out.push(
        `${md ? "- " : ""}Analyst: ${plural(r.analyst.claims, "claim")}, ${plural(r.analyst.relations, "stance")}, each quote checked in Zetaris.`,
      )
    if (md && r.sql)
      out.push(
        "",
        "The Zetaris statement that checked every quote:",
        "",
        "```sql",
        r.sql.trim(),
        "```",
      )
  }

  out.push(
    "",
    style.dim(
      `Trace: ${run.trace} (${run.traceEvents} steps)${run.mode === "sample" ? " · sample mode" : ""}`,
    ),
  )
  return out.join("\n")
}

/** The run as JSON, for scripts. */
export function json(run: Run) {
  return {
    mode: run.mode,
    status: run.status,
    question: run.question,
    answer: run.final
      ? { body: run.final.body, caveat: run.final.caveat ?? null, citations: run.final.citations }
      : null,
    revisions: run.revisions,
    matrix: run.matrix ?? null,
    receipt: run.receipt ?? null,
    runId: run.runId,
    trace: run.trace,
  }
}

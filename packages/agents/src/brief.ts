import { BRIEF, ZETARIS } from "@konkyo/config"
import { checkQuotes, sqlHash } from "@konkyo/zetaris"
import { generateText, Output } from "ai"
import { z } from "zod"
import { quoteKey } from "./citations"
import { model, reasoning, withFallback } from "./models"
import type { Tracer } from "./trace"
import type { StudyPassage, StudyWindow } from "./tutor"

const Script = z.object({
  title: z.string().describe("The brief's title, 3-8 words"),
  lines: z.array(
    z.object({
      speaker: z.enum(["A", "B"]),
      text: z
        .string()
        .describe(
          "What they say: one to three spoken sentences, plain words, no lists or markdown",
        ),
      passage: z
        .string()
        .nullable()
        .describe(
          "The label of the passage this line's facts come from; null only for a line with no facts (a greeting, a question, a link between ideas)",
        ),
      quote: z
        .string()
        .nullable()
        .describe("4-25 words copied exactly from that passage that support the line"),
    }),
  ),
})

const BRIEF_INSTRUCTIONS = `Two hosts talk a listener through this material in a short audio brief. A opens with what the material is about; together they cover its main ideas and findings, say where sources agree or differ, and B closes with the one thing to remember.
- 10 to 16 short lines, alternating A and B, under ${BRIEF.maxChars - 200} characters in all: it is read aloud.
- Every fact comes from the passages, never from outside knowledge. A line with a fact names its passage and copies 4-25 words from it exactly, character for character.
- Talk like people, not a paper: no lists, no "according to passage p3"; name a source by its authors or title when it helps.`

const Verdicts = z.object({
  lines: z.array(
    z.object({
      n: z.number(),
      ok: z.boolean(),
      problem: z.string().describe("Empty when ok; otherwise what isn't supported"),
    }),
  ),
})

export type BriefCitation = {
  fileId: string
  passageId: string
  title: string
  page: number | null
  tStart: number | null
  quote: string
}
export type BriefLine = { speaker: "A" | "B"; text: string; citation: BriefCitation | null }

/**
 * The audio brief's script (plan F37): the Writer drafts two hosts' lines from the folder's most
 * central passages; every quote is checked in code and in Zetaris, and the Verifier keeps a line
 * only if its passage supports it (a line with no citation only if it states no fact). What's
 * left is what gets spoken, so nothing unsupported is ever said aloud.
 */
export async function writeBrief(windows: StudyWindow[], name: string, tracer?: Tracer) {
  const passages = windows.flatMap((w) => w.passages)
  const labelled = passages.map((p, i) => ({ label: `p${i + 1}`, p }))
  const byLabel = new Map(labelled.map((l) => [l.label, l.p]))
  const started = performance.now()
  const { result, choice } = await withFallback("writer", "writer", tracer, "brief", (c) =>
    generateText({
      model: model(c),
      providerOptions: reasoning(c),
      output: Output.object({ schema: Script }),
      instructions: BRIEF_INSTRUCTIONS,
      prompt: `Material: "${name}"\n\n${labelled
        .map(({ label, p }) => `[${label}] (${p.title}) ${p.text.replace(/\p{Cc}/gu, " ")}`)
        .join("\n")}`,
    }),
  )
  tracer?.log({
    agent: "writer",
    step: "brief",
    action: "wrote_script",
    model: choice.id,
    latencyMs: Math.round(performance.now() - started),
    tokens: { input: result.usage.inputTokens, output: result.usage.outputTokens },
    rowsReturned: result.output.lines.length,
  })

  // Code check: a cited line's quote must be in the passage it names (or, misnamed, in another).
  let dropped = 0
  const drafted = result.output.lines.flatMap((line) => {
    const text = line.text.trim()
    if (!text) return []
    if (!line.passage || !line.quote) return [{ line, text, at: null as StudyPassage | null }]
    const key = quoteKey(line.quote)
    const named = byLabel.get(line.passage.trim())
    const at =
      key.length < 12
        ? undefined
        : named && quoteKey(named.text).includes(key)
          ? named
          : passages.find((p) => quoteKey(p.text).includes(key))
    if (!at) {
      dropped++
      return []
    }
    return [{ line, text, at }]
  })

  // Zetaris confirms every quote in its own reading of the source, in one statement.
  const cited = drafted.flatMap((d, i) => (d.at ? [{ i, d }] : []))
  const zetaris = await checkQuotes(
    cited.map(({ i, d }) => ({
      qid: `b${i}`,
      fileId: (d.at as StudyPassage).fileId,
      passageId: (d.at as StudyPassage).id,
      quote: d.line.quote as string,
      transcript: (d.at as StudyPassage).page == null,
    })),
    { timeoutMs: ZETARIS.backgroundTimeoutMs },
  )
  tracer?.log({
    agent: "verifier",
    step: "brief",
    action: "queried_zetaris",
    sqlHash: zetaris.sql ? sqlHash(zetaris.sql) : undefined,
    rowsReturned: zetaris.rows,
    latencyMs: zetaris.ms,
    detail: {
      checked: cited.length,
      found: zetaris.found.size,
      // The quotes Zetaris's own reading didn't contain, so the trace shows what was cut.
      missing: cited
        .filter(({ i }) => !zetaris.found.has(`b${i}`))
        .map(({ d }) => ({ passage: d.at?.id, quote: d.line.quote })),
    },
  })
  const confirmed = drafted.filter((d, i) => {
    const ok = !d.at || zetaris.found.has(`b${i}`)
    if (!ok) dropped++
    return ok
  })

  // The Verifier: each cited line against its passage; each uncited line must state no fact.
  const { result: verdict, choice: verifier } = await withFallback(
    "verifier",
    "verifier",
    tracer,
    "brief",
    (c) =>
      generateText({
        model: model(c),
        providerOptions: reasoning(c),
        output: Output.object({ schema: Verdicts }),
        instructions:
          "Check an audio brief line by line. A line with a passage is ok only if that passage supports everything the line states. A line without a passage is ok only if it states no fact (a greeting, a question, a link between ideas).",
        prompt: confirmed
          .map(
            (d, n) =>
              `[${n}] ${d.line.speaker}: ${d.text}\n${d.at ? `Passage: ${d.at.text.replace(/\p{Cc}/gu, " ")}` : "Passage: none"}`,
          )
          .join("\n\n"),
      }),
  )
  const verdicts = new Map(verdict.output.lines.map((v) => [v.n, v]))
  const kept = confirmed.filter((_, n) => verdicts.get(n)?.ok === true)
  dropped += confirmed.length - kept.length
  tracer?.log({
    agent: "verifier",
    step: "brief",
    action: "checked_lines",
    model: verifier.id,
    verdict: `${kept.length}/${confirmed.length} supported`,
    detail: Object.fromEntries(
      [...verdicts].filter(([, v]) => !v.ok).map(([n, v]) => [`line${n}`, v.problem]),
    ),
  })

  // Read aloud in one request: lines past the limit are left out, never cut mid-sentence.
  let chars = 0
  const lines: BriefLine[] = []
  for (const d of kept) {
    chars += d.text.length
    if (chars > BRIEF.maxChars) break
    lines.push({
      speaker: d.line.speaker,
      text: d.text,
      citation: d.at
        ? {
            fileId: d.at.fileId,
            passageId: d.at.id,
            title: d.at.title,
            page: d.at.page,
            tStart: d.at.tStart,
            quote: (d.line.quote as string).trim(),
          }
        : null,
    })
  }
  return { title: result.output.title.trim() || name, lines, dropped, sql: zetaris.sql }
}

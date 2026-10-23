import { checkQuotes, evidenceKey, presentDocuments, sqlHash } from "@konkyo/zetaris"
import { generateText, Output, streamText } from "ai"
import { z } from "zod"
import { type Analysis, analyse, type Matrix } from "./analyst"
import {
  citesOf,
  NOT_IN_LIBRARY,
  normalise,
  type ParsedAnswer,
  parseAnswer,
  quoteKey,
  type SourceLine,
} from "./citations"
import { type Recalled, recall } from "./memory"
import { MODELS, type ModelChoice, model, noFallback, type Role, reasoning } from "./models"
import { type Candidate, hybridSearch, type Scope } from "./retrieve"
import type { Tracer } from "./trace"

/** A passage the Writer may cite, labelled p1…pN in its prompt. */
export type SourceRef = {
  label: string
  passageId: string
  fileId: string
  title: string
  kind: string
  page: number | null
  tStart: number | null
  text: string
  byline?: string
}

export type CitationState = "verified" | "rewritten"
export type Citation = SourceRef & { n: number; quote: string; state: CitationState }

export type Receipt = {
  quotes: number
  sources: number
  rewritten: number
  dropped: number
  rounds: number
  verifyMs: number
  totalMs: number
  /** The one Zetaris statement that checked every quote (Show SQL). */
  sql: string
  precheckSql: string
  models: Record<string, string>
  /** H-MEM memories that shaped this answer (their confidence follows the answer's 👍/👎). */
  memories: { id: string; content: string }[]
  /** The Analyst's comparison, when the question weighed several sources (F13). */
  analyst?: { claims: number; sources: number; relations: number; sql: string }
}

export type AnswerEvent =
  | {
      type: "step"
      id: string
      label: string
      state: "running" | "done" | "failed"
      detail?: string
    }
  | { type: "sources"; sources: SourceRef[] }
  | { type: "text"; delta: string }
  | { type: "revising"; round: number; reasons: string[] }
  | {
      type: "final"
      body: string
      caveat?: string
      citations: Citation[]
      /** Sentences of the final text that the Verifier sent back and the Writer rewrote. */
      rewritten: string[]
    }
  | { type: "not-found"; question: string; reason: "no-passages" | "writer" }
  /** The agree/disagree matrix: first with cells "checking", then only the verified cells. */
  | { type: "matrix"; matrix: Matrix }
  | { type: "receipt"; receipt: Receipt }

export type AnswerInput = {
  ownerId: string
  question: string
  /** Earlier turns, oldest first, as plain text (the answer without its Sources block). */
  history: { role: "user" | "assistant"; text: string }[]
  scope: Scope
  tracer: Tracer
  emit: (event: AnswerEvent) => void
  abortSignal?: AbortSignal
  /** Weigh the sources against each other whatever the Planner says (deep search's answers). */
  compare?: boolean
}

const MAX_ROUNDS = 2
/** Below this best cosine similarity, and with no full-text hit, the library doesn't cover it. */
const MIN_SIMILARITY = 0.22

/** Best-ranked first, at most `perFile` from any one file, `limit` in all. */
function spread(candidates: Candidate[], perFile: number, limit: number) {
  const taken = new Map<string, number>()
  return candidates
    .filter((c) => {
      const n = taken.get(c.fileId) ?? 0
      if (n >= perFile) return false
      taken.set(c.fileId, n + 1)
      return true
    })
    .slice(0, limit)
}

/** Runs one model call, escalating to the role's fallback model on failure (plan §2 Escalation). */
async function withFallback<T>(
  role: Role,
  tracer: Tracer,
  step: string,
  call: (choice: ModelChoice) => Promise<T>,
): Promise<{ result: T; choice: ModelChoice }> {
  const { primary, fallback } = MODELS[role]
  try {
    return { result: await call(primary), choice: primary }
  } catch (error) {
    if (noFallback(error)) throw error
    tracer.log({
      agent:
        role === "retriever"
          ? "retriever"
          : (role as "planner" | "writer" | "verifier" | "analyst"),
      step,
      action: "escalated_to_fallback",
      model: fallback.id,
      detail: { reason: (error as Error).message.slice(0, 300), from: primary.id },
    })
    return { result: await call(fallback), choice: fallback }
  }
}

// ------------------------------------------------------------------ planner

const PlanSchema = z.object({
  standalone: z
    .string()
    .describe("The question rewritten to stand alone, using the conversation for missing context"),
  queries: z
    .array(z.string())
    .min(1)
    .max(3)
    .describe("1-3 short search queries that would find the passages answering it"),
  needsLibrary: z
    .boolean()
    .describe("false only for greetings or questions about the assistant itself"),
  compare: z
    .boolean()
    .describe(
      "true when answering means weighing several sources against each other: comparisons, agreement or disagreement, what different papers or speakers say about one thing",
    ),
})

/** What the person has told Konkyo before, as guidance; never evidence, never cited. */
const memoryBlock = (memories: Recalled[]) =>
  memories.length
    ? `What this person has corrected before (from their memory, not evidence; never cite it):\n${memories
        .map((m) => `- ${m.content}`)
        .join("\n")}\n\n`
    : ""

async function plan(input: AnswerInput, memories: Recalled[]) {
  const started = performance.now()
  const history = input.history
    .slice(-6)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text.slice(0, 1200)}`)
    .join("\n")
  const { result, choice } = await withFallback("planner", input.tracer, "plan", (c) =>
    generateText({
      model: model(c),
      providerOptions: reasoning(c),
      output: Output.object({ schema: PlanSchema }),
      instructions:
        "You are the Planner in a research assistant that answers from the user's own library of documents and recordings. If the latest question already stands alone, keep the user's own words as `standalone`; otherwise rewrite it minimally using the conversation. Then write search queries for the library: keywords and phrases its passages would contain, not questions.",
      prompt: `${memoryBlock(memories)}${history ? `Conversation so far:\n${history}\n\n` : ""}Latest question: ${input.question}`,
      abortSignal: input.abortSignal,
    }),
  )
  const out = result.output
  input.tracer.log({
    agent: "planner",
    step: "plan",
    action: "planned",
    model: choice.id,
    latencyMs: Math.round(performance.now() - started),
    tokens: { input: result.usage.inputTokens, output: result.usage.outputTokens },
    detail: out,
  })
  return { ...out, model: choice.id }
}

// ------------------------------------------------------------------ writer

const WRITER_INSTRUCTIONS = `You are the Writer in a research assistant. Answer ONLY from the given passages from the user's library.
Every sentence must carry at least one numbered citation [n], placed before the sentence's final punctuation, and for each citation number a quote that is an EXACT verbatim substring of its passage (copy the characters exactly, at least five words, no ellipses).
Choose each quote so that it, on its own, states what its sentence claims: the reader is shown the quote as proof. So write one finding per sentence; never pack several findings behind one citation.
When passages come from several sources, say what each relevant source found (with its own citation), and where they differ.
If the question contains a claim the passages do not support, answer it directly in a cited sentence ("No: the paper reports … [1].") and say what the passages actually report. Be direct and plain. Use 2-7 sentences; start a new paragraph for a new idea.
If the passages do not answer the question at all, reply with exactly: ${NOT_IN_LIBRARY}

Output format (plain text, exactly this layout, nothing else):
<answer sentences, each with its citation markers, e.g. "... during slow-wave sleep [1].">
Caveat: <one line on what the sources leave open>
Sources:
[1] p3: "<exact verbatim quote from p3>"
[2] p1: "<exact verbatim quote from p1>"
(one line per citation number; the id after the number is the passage id)`

function passagesBlock(sources: SourceRef[]) {
  return sources
    .map((s) => {
      const where =
        s.page != null
          ? `page ${s.page}`
          : s.tStart != null
            ? `at ${Math.floor(s.tStart / 60)}:${String(Math.floor(s.tStart % 60)).padStart(2, "0")}`
            : ""
      // Older passages may hold control characters (symbol-font glyphs); the model would
      // "copy" them as some other letter and the quote would never match.
      const what = s.kind === "note" ? `the person's own note “${s.title}”` : s.title
      return `[${s.label}] (${what}${where ? `, ${where}` : ""})\n${s.text.replace(/\p{Cc}/gu, " ")}`
    })
    .join("\n\n")
}

async function write(
  input: AnswerInput,
  question: string,
  sources: SourceRef[],
  feedback: string | null,
  onDelta?: (delta: string) => void,
  memories: Recalled[] = [],
) {
  const started = performance.now()
  const prompt =
    `${memoryBlock(memories)}Passages:\n${passagesBlock(sources)}\n\nQuestion: ${question}` +
    (feedback
      ? `\n\nYour previous draft was REJECTED by the Verifier:\n${feedback}\n\nRewrite the answer fixing every problem. Use only facts and exact quotes from the passages.`
      : "")
  const { result, choice } = await withFallback("writer", input.tracer, "write", async (c) => {
    if (!onDelta) {
      const r = await generateText({
        model: model(c),
        providerOptions: reasoning(c),
        instructions: WRITER_INSTRUCTIONS,
        prompt,
        abortSignal: input.abortSignal,
      })
      return { text: r.text, usage: r.usage }
    }
    const stream = streamText({
      model: model(c),
      providerOptions: reasoning(c),
      instructions: WRITER_INSTRUCTIONS,
      prompt,
      abortSignal: input.abortSignal,
    })
    let text = ""
    for await (const delta of stream.textStream) {
      text += delta
      onDelta(delta)
    }
    return { text, usage: await stream.usage }
  })
  input.tracer.log({
    agent: "writer",
    step: feedback ? "revise" : "draft",
    action: feedback ? "revised_answer" : "drafted_answer",
    model: choice.id,
    latencyMs: Math.round(performance.now() - started),
    tokens: { input: result.usage.inputTokens, output: result.usage.outputTokens },
  })
  return { text: result.text, model: choice.id }
}

const FixSchema = z.object({
  fixes: z.array(
    z.object({
      sentence: z.number().int().describe("The rejected sentence's number"),
      text: z
        .string()
        .describe(
          "The corrected sentence with markers [1], [2]… numbered within it; empty to drop it",
        ),
      quotes: z.array(
        z.object({
          marker: z.number().int(),
          passage: z.string().describe("Passage id, e.g. p3"),
          quote: z
            .string()
            .describe("An EXACT verbatim substring of that passage, at least five words"),
        }),
      ),
    }),
  ),
})

/**
 * The critique loop's rewrite (plan F12): only the sentences the Verifier rejected go back to
 * the Writer, with its reasons; every other sentence stays word for word. The Writer returns a
 * corrected sentence with its own quotes, or nothing, which drops it.
 */
async function reviseSentences(
  input: AnswerInput,
  draft: ParsedAnswer,
  rejected: { index: number; reasons: string[] }[],
  sources: SourceRef[],
) {
  const started = performance.now()
  const { result, choice } = await withFallback("writer", input.tracer, "revise", (c) =>
    generateText({
      model: model(c),
      providerOptions: reasoning(c),
      output: Output.object({ schema: FixSchema }),
      instructions: `${WRITER_INSTRUCTIONS}\n\nNow you are correcting single sentences the Verifier rejected. Fix each so every fact in it is stated in the passages it cites, or return an empty text to drop it. Do not touch other sentences.`,
      prompt: `Passages:\n${passagesBlock(sources)}\n\nAnswer so far:\n${draft.sentences
        .map((sn, i) => `(${i + 1}) ${sn.text}`)
        .join("\n")}\n\nRejected by the Verifier:\n${rejected
        .map((r) => `(${r.index + 1}) ${r.reasons.join("; ")}`)
        .join("\n")}`,
      abortSignal: input.abortSignal,
    }),
  )
  input.tracer.log({
    agent: "writer",
    step: "revise",
    action: "revised_sentences",
    model: choice.id,
    latencyMs: Math.round(performance.now() - started),
    tokens: { input: result.usage.inputTokens, output: result.usage.outputTokens },
    detail: { sentences: rejected.map((r) => r.index + 1) },
  })

  // Merge: replace each fixed sentence, giving its quotes fresh citation numbers.
  let next = Math.max(0, ...draft.sources.map((l) => l.n))
  const lines = [...draft.sources]
  const texts = draft.sentences.map((sn) => sn.text)
  const rewritten: string[] = []
  for (const fix of result.output.fixes) {
    const i = fix.sentence - 1
    if (texts[i] == null) continue
    if (!fix.text.trim()) {
      texts[i] = ""
      continue
    }
    const local = new Map<number, number>()
    for (const q of fix.quotes) {
      next++
      local.set(q.marker, next)
      lines.push({ n: next, label: q.passage.toLowerCase(), quote: q.quote })
    }
    texts[i] = fix.text.replace(/\[(\d+)\]/g, (m, k: string) =>
      local.has(Number(k)) ? `[${local.get(Number(k))}]` : m,
    )
    rewritten.push(texts[i] as string)
  }
  let body = draft.body
  draft.sentences.forEach((sn, i) => {
    if (texts[i] !== sn.text) body = body.replace(sn.text, texts[i] ?? "")
  })
  const raw = `${body.replace(/[ \t]+\n/g, "\n").trim()}\n${draft.caveat ? `Caveat: ${draft.caveat}\n` : ""}Sources:\n${lines
    .map((l) => `[${l.n}] ${l.label}: "${l.quote}"`)
    .join("\n")}`
  return { draft: parseAnswer(raw), rewritten }
}

// ------------------------------------------------------------------ verifier

// The benchmark's measured Verifier prompt (0/10 false rejections at Luna "low"), plus one rule:
// correcting the question's false premise is not an unsupported claim.
const VERIFIER_INSTRUCTIONS = `You are the Verifier. A claim is supported only if every fact in it (numbers, durations, significance) is stated in its cited passages. Be strict about numbers. Paraphrase is fine when the meaning is the same.
Correcting a false premise from the question ("not 12, as asked") is supported when the passage states the correct fact.`

const SupportSchema = z.object({
  results: z.array(
    z.object({
      claim: z.number().int().describe("The claim's number"),
      supported: z.boolean(),
      reason: z
        .string()
        .describe(
          "Empty when supported; otherwise at most 12 words on what the passages do not say",
        ),
    }),
  ),
})

type Verdict = {
  ok: boolean
  /** Problems to send back to the Writer. */
  reasons: string[]
  /** Citation numbers whose quote failed the code or Zetaris check. */
  badQuotes: Set<number>
  /** Sentences (by index) the support check rejected. */
  unsupported: Set<number>
  /** Every reason a sentence failed (its own support check, or a failed quote it cites). */
  reasonsBySentence: Map<number, string[]>
  sql: string
  zetarisMs: number
  model: string
}

async function verify(
  input: AnswerInput,
  draft: ParsedAnswer,
  sources: SourceRef[],
  round: number,
  missingDocs: Set<string>,
): Promise<Verdict> {
  const started = performance.now()
  const byLabel = new Map(sources.map((s) => [s.label, s]))
  const lineByN = new Map(draft.sources.map((l) => [l.n, l]))
  const reasons: string[] = []
  const badQuotes = new Set<number>()
  const quoteReasons = new Map<number, string>()
  const supportReasons = new Map<number, string>()
  const failQuote = (n: number, why: string) => {
    badQuotes.add(n)
    reasons.push(why)
    quoteReasons.set(n, why)
  }

  // 1. Code check: each cited number has a source line whose quote is in that passage. A quote
  //    that is verbatim in a different given passage is moved there (the words are real; the
  //    label was wrong), so the citation opens where the words actually are.
  const used = [...new Set(draft.sentences.flatMap((s) => s.cites))]
  const keyOf = new Map(sources.map((src) => [src.label, quoteKey(src.text)]))
  for (const n of used) {
    const line = lineByN.get(n)
    const source = line && byLabel.get(line.label)
    if (!line || !source) {
      failQuote(n, `[${n}] has no source line naming one of the given passages`)
      continue
    }
    if (line.quote.split(/\s+/).length < 3) {
      failQuote(n, `[${n}] quote is too short to check: "${line.quote}"`)
      continue
    }
    const key = quoteKey(line.quote)
    if (keyOf.get(line.label)?.includes(key)) continue
    const actual = sources.find((src) => keyOf.get(src.label)?.includes(key))
    if (actual) {
      input.tracer.log({
        agent: "verifier",
        step: `verify_${round}`,
        action: "reattributed_quote",
        detail: { n, from: line.label, to: actual.label },
      })
      line.label = actual.label
    } else {
      failQuote(n, `[${n}] quote is not verbatim in ${line.label}: "${line.quote}"`)
    }
  }
  // Quotes from documents the Zetaris pre-check could not find are not evidence.
  for (const n of used) {
    const source = byLabel.get(lineByN.get(n)?.label ?? "")
    if (source && missingDocs.has(source.fileId) && !badQuotes.has(n)) {
      failQuote(n, `[${n}] cites a document that is not in the evidence store`)
    }
  }

  // 2. Zetaris check (one statement) and 3. support check (one call), in parallel.
  const toCheck = used.flatMap((n) => {
    const line = lineByN.get(n)
    const source = line && byLabel.get(line.label)
    return line && source && !badQuotes.has(n) ? [{ n, line, source }] : []
  })
  const claims = draft.sentences.map((s, i) => ({
    i,
    text: s.text,
    evidence: s.cites.flatMap((n) => {
      const line = lineByN.get(n)
      const source = line && byLabel.get(line.label)
      return line && source ? [{ n, quote: line.quote, source }] : []
    }),
  }))
  const [zetaris, support] = await Promise.all([
    checkQuotes(
      toCheck.map(({ n, line, source }) => ({
        qid: String(n),
        fileId: source.fileId,
        passageId: source.passageId,
        quote: line.quote,
        // Recordings and notes have no PDF: their quotes are checked against their passages.
        transcript: source.page == null,
      })),
    ),
    withFallback("verifier", input.tracer, "support", (c) =>
      generateText({
        model: model(c),
        providerOptions: reasoning(c),
        output: Output.object({ schema: SupportSchema }),
        instructions: VERIFIER_INSTRUCTIONS,
        prompt: `${claims
          .map(
            (c) =>
              `Claim ${c.i + 1}: "${c.text}"\n${
                c.evidence.length
                  ? c.evidence
                      .map(
                        (e) =>
                          `  [${e.n}] quote: "${e.quote}"\n      passage ${e.source.label} (context): ${e.source.text}`,
                      )
                      .join("\n")
                  : "  (no citation: an uncited sentence must be a transition, not a fact)"
              }`,
          )
          .join("\n")}\n\nFor every claim, say whether its cited passages support it.`,
        abortSignal: input.abortSignal,
      }),
    ),
  ])

  for (const { n, line } of toCheck) {
    if (!zetaris.found.has(String(n))) {
      failQuote(n, `[${n}] quote was not found in the document in Zetaris: "${line.quote}"`)
    }
  }
  const unsupported = new Set<number>()
  for (const r of support.result.output.results) {
    if (!r.supported) {
      unsupported.add(r.claim - 1)
      supportReasons.set(r.claim - 1, r.reason || "not supported by its passages")
      reasons.push(`unsupported: "${claims[r.claim - 1]?.text ?? ""}" (${r.reason})`)
    }
  }
  input.tracer.log({
    agent: "verifier",
    step: `verify_${round}`,
    action: "queried_zetaris",
    sqlHash: sqlHash(zetaris.sql || "-"),
    rowsReturned: zetaris.rows,
    latencyMs: zetaris.ms,
    verdict: `${toCheck.length - [...badQuotes].length}/${used.length} quotes found`,
  })
  input.tracer.log({
    agent: "verifier",
    step: `verify_${round}`,
    action: reasons.length ? "rejected_to_writer" : "approved",
    model: support.choice.id,
    latencyMs: Math.round(performance.now() - started),
    tokens: {
      input: support.result.usage.inputTokens,
      output: support.result.usage.outputTokens,
    },
    verdict: reasons.length ? "rejected" : "approved",
    detail: reasons.length ? { reasons } : undefined,
  })
  const reasonsBySentence = new Map<number, string[]>()
  draft.sentences.forEach((sn, i) => {
    const why = [
      ...(unsupported.has(i) ? [supportReasons.get(i) ?? "not supported by its passages"] : []),
      ...sn.cites
        .filter((n) => badQuotes.has(n))
        .map((n) => quoteReasons.get(n) ?? `[${n}] quote failed`),
    ]
    if (why.length) reasonsBySentence.set(i, why)
  })
  return {
    ok: reasons.length === 0,
    reasons,
    badQuotes,
    unsupported,
    reasonsBySentence,
    sql: zetaris.sql,
    zetarisMs: zetaris.ms,
    model: support.choice.id,
  }
}

// ------------------------------------------------------------------ the run

function toSources(candidates: Candidate[]): SourceRef[] {
  return candidates.map((c, i) => ({
    label: `p${i + 1}`,
    passageId: c.id,
    fileId: c.fileId,
    title: c.title,
    kind: c.kind,
    page: c.page,
    tStart: c.tStart,
    text: c.text,
    byline: c.byline,
  }))
}

/** A sentence compared without its citation markers. */
const plainKey = (text: string) => normalise(text.replace(/\[[^\]]*\]/g, ""))

/** Removes failed sentences and the markers of failed quotes, renumbering what remains 1…k. */
function finalise(
  draft: ParsedAnswer,
  verdict: Verdict,
  sources: SourceRef[],
  rewrittenTexts: Set<string>,
) {
  const byLabel = new Map(sources.map((s) => [s.label, s]))
  const lineByN = new Map(draft.sources.map((l) => [l.n, l]))
  const kept = draft.sentences.filter((s, i) => {
    if (verdict.unsupported.has(i)) return false
    const good = s.cites.filter((n) => !verdict.badQuotes.has(n))
    return s.cites.length === 0 || good.length > 0
  })
  const renumber = new Map<number, number>()
  const citations: Citation[] = []
  const rewritten: string[] = []
  const paragraphs = draft.body.split(/\n{2,}/)
  const out: string[] = []
  for (const paragraph of paragraphs) {
    const sentences = kept.filter((s) => paragraph.includes(s.text))
    if (!sentences.length) continue
    out.push(
      sentences
        .map((s) => {
          const text = s.text
            .replace(/\[(\d+(?:\s*[,–-]\s*\d+)*)\]/g, (_marker, inner: string) => {
              const nums = citesOf(`[${inner}]`).filter(
                (n) => !verdict.badQuotes.has(n) && lineByN.has(n),
              )
              if (!nums.length) return ""
              return nums
                .map((n) => {
                  if (!renumber.has(n)) {
                    const line = lineByN.get(n) as SourceLine
                    const source = byLabel.get(line.label) as SourceRef
                    const next = renumber.size + 1
                    renumber.set(n, next)
                    citations.push({ ...source, n: next, quote: line.quote, state: "verified" })
                  }
                  return `[${renumber.get(n)}]`
                })
                .join("")
            })
            .replace(/\s+([.,;:!?])/g, "$1")
          if (rewrittenTexts.has(plainKey(s.text))) rewritten.push(text)
          return text
        })
        .join(" "),
    )
  }
  // Citations used only by rewritten sentences read "rewritten" (the chip shows it was corrected).
  for (const c of citations) {
    const inRewritten = rewritten.some((t) => t.includes(`[${c.n}]`))
    const inKept = out
      .join(" ")
      .split(/(?<=[.!?])\s+/)
      .some((t) => t.includes(`[${c.n}]`) && !rewritten.includes(t))
    if (inRewritten && !inKept) c.state = "rewritten"
  }
  return {
    body: out.join("\n\n"),
    citations,
    rewritten,
    dropped: draft.sentences.length - kept.length,
  }
}

/**
 * One answer (plan §3 "Answer flow"): Planner → Retriever (hybrid, RRF) → Zetaris pre-check →
 * Writer (streams) → Verifier (code + one Zetaris statement + support check) → at most two
 * rewrites → whatever still fails is dropped. Nothing unverified is presented as verified.
 */
export async function answer(input: AnswerInput) {
  const runStarted = performance.now()
  const { tracer, emit } = input
  const step = (id: string, label: string, state: "running" | "done" | "failed", detail?: string) =>
    emit({ type: "step", id, label, state, detail })

  // The person's corrections memory (Meterless H-MEM), read before planning, every run.
  const memories = await recall(input.ownerId, input.question)
  if (memories.length)
    step(
      "memory",
      `Read ${memories.length} correction${memories.length === 1 ? "" : "s"} from your memory`,
      "done",
    )
  step("plan", "Planning", "running")
  tracer.log({
    agent: "planner",
    step: "memory",
    action: "read_hmem",
    rowsReturned: memories.length,
    detail: {
      memories: memories.map((m) => ({ id: m.id, relevance: Number(m.relevance.toFixed(3)) })),
    },
  })
  const planned = await plan(input, memories)
  step("plan", "Planning", "done", planned.standalone)

  step("search", "Searching your library", "running")
  const searchStarted = performance.now()
  // A comparison needs every source heard: fetch wider, then keep at most 3 passages per file
  // (best first), so two long papers can't crowd out the rest.
  const comparison = input.compare || planned.compare
  const found = await hybridSearch(
    input.ownerId,
    [...new Set([planned.standalone, ...planned.queries])],
    input.scope,
    comparison ? 40 : 12,
  )
  const candidates = comparison ? spread(found.candidates, 3, 14) : found.candidates
  const best = Math.max(0, ...candidates.map((c) => c.similarity))
  tracer.log({
    agent: "retriever",
    step: "search",
    action: "hybrid_search",
    latencyMs: Math.round(performance.now() - searchStarted),
    rowsReturned: candidates.length,
    detail: {
      queries: planned.queries,
      bestSimilarity: Number(best.toFixed(3)),
      scope: input.scope,
    },
  })
  const files = new Set(candidates.map((c) => c.fileId))
  step(
    "search",
    "Searching your library",
    "done",
    `${candidates.length} passages from ${files.size} file${files.size === 1 ? "" : "s"}`,
  )

  if (!candidates.length || (best < MIN_SIMILARITY && planned.needsLibrary)) {
    emit({ type: "not-found", question: planned.standalone, reason: "no-passages" })
    tracer.log({
      agent: "retriever",
      step: "search",
      action: "not_in_library",
      verdict: "not_found",
    })
    await tracer.flush()
    return { status: "not-found" as const }
  }

  // The Zetaris pre-check runs while the Writer writes: every retrieved file was confirmed in
  // Zetaris at ingest, so a miss is rare, and when it happens the Verifier fails those quotes.
  step("precheck", "Checking sources in Zetaris", "running")
  // The pre-check is advisory (each file was confirmed in Zetaris at ingest): if Zetaris can't
  // answer it, the run goes on and the Verifier's own Zetaris check still guards every quote.
  const precheck = presentDocuments([...files]).then(
    (pre) => {
      tracer.log({
        agent: "verifier",
        step: "precheck",
        action: "queried_zetaris",
        sqlHash: sqlHash(pre.sql),
        rowsReturned: pre.present.size,
        latencyMs: pre.ms,
        detail: { missing: [...files].filter((f) => !pre.present.has(f)) },
      })
      step(
        "precheck",
        "Checking sources in Zetaris",
        pre.present.size === files.size ? "done" : "failed",
        `${pre.present.size} of ${files.size} files confirmed`,
      )
      return pre
    },
    (error: Error) => {
      tracer.log({
        agent: "verifier",
        step: "precheck",
        action: "failed",
        detail: { message: error.message.slice(0, 300) },
      })
      step(
        "precheck",
        "Checking sources in Zetaris",
        "failed",
        "Zetaris didn't answer; quotes are still checked",
      )
      return { present: new Set(files), sql: "", ms: 0 }
    },
  )

  const sources = toSources(candidates)
  emit({ type: "sources", sources })

  // The Analyst compares sources alongside the Writer (F13), so the matrix costs no extra wait.
  // Once the run has answered "not found", nothing it finds later is sent.
  let closed = false
  const comparing = comparison && files.size >= 2
  if (comparing) step("analyse", "Comparing sources", "running")
  const analysis: Promise<Analysis | null> = comparing
    ? analyse(input, planned.standalone, sources, (matrix) => {
        if (!closed) emit({ type: "matrix", matrix })
      }).then(
        (done) => {
          if (!closed)
            step(
              "analyse",
              "Comparing sources",
              "done",
              done?.matrix.claims.length
                ? `${done.matrix.counts.claims} claim${done.matrix.counts.claims === 1 ? "" : "s"} across ${done.matrix.counts.sources} sources`
                : "No claims the sources share",
            )
          return done
        },
        (error: Error) => {
          tracer.log({
            agent: "analyst",
            step: "claims",
            action: "failed",
            detail: { message: error.message.slice(0, 300) },
          })
          if (!closed) step("analyse", "Comparing sources", "failed")
          return null
        },
      )
    : Promise.resolve(null)

  step("write", "Writing", "running")
  const draftText = (
    await write(
      input,
      planned.standalone,
      sources,
      null,
      (delta) => emit({ type: "text", delta }),
      memories,
    )
  ).text
  step("write", "Writing", "done")
  const pre = await precheck
  const missingDocs = new Set([...files].filter((f) => !pre.present.has(f)))
  let draft = parseAnswer(draftText)
  if (draft.notInLibrary || !draft.sentences.length) {
    closed = true
    emit({ type: "not-found", question: planned.standalone, reason: "writer" })
    tracer.log({ agent: "writer", step: "draft", action: "not_in_library", verdict: "not_found" })
    await tracer.flush()
    return { status: "not-found" as const }
  }

  const verifyStarted = performance.now()
  let verdict!: Verdict
  let rounds = 0
  const rewrittenTexts = new Set<string>()
  // A later round can fail more than an earlier one; the answer keeps the round that verified most.
  let bestRound: { draft: ParsedAnswer; verdict: Verdict; passing: number } | null = null
  for (let round = 0; ; round++) {
    const count = [...new Set(draft.sentences.flatMap((s) => s.cites))].length
    step("verify", `Verifying ${count} citation${count === 1 ? "" : "s"}`, "running")
    verdict = await verify(input, draft, sources, round, missingDocs)
    const passing = draft.sentences.length - verdict.reasonsBySentence.size
    if (!bestRound || passing > bestRound.passing) bestRound = { draft, verdict, passing }
    if (verdict.ok || round >= MAX_ROUNDS) break
    rounds++
    emit({ type: "revising", round: rounds, reasons: verdict.reasons })
    step("verify", "Rewriting what didn't check out", "running", verdict.reasons[0])
    const rejected = draft.sentences.flatMap((_sentence, index) => {
      const why = verdict?.reasonsBySentence.get(index) ?? []
      return why.length ? [{ index, reasons: why }] : []
    })
    if (!rejected.length) break
    const revised = await reviseSentences(input, draft, rejected, sources)
    for (const t of revised.rewritten) rewrittenTexts.add(plainKey(t))
    if (!revised.draft.sentences.length) break
    draft = revised.draft
  }

  if (bestRound && bestRound.verdict !== verdict) {
    draft = bestRound.draft
    verdict = bestRound.verdict
  }
  const final = finalise(draft, verdict, sources, rewrittenTexts)
  step(
    "verify",
    `Verified ${final.citations.length} citation${final.citations.length === 1 ? "" : "s"}`,
    "done",
  )
  emit({
    type: "final",
    body: final.body,
    caveat: draft.caveat,
    citations: final.citations,
    rewritten: final.rewritten,
  })
  const analysed = await analysis
  const receipt: Receipt = {
    quotes: final.citations.length,
    // Every source a checked quote came from: the answer's and the matrix's.
    sources: new Set([
      ...final.citations.map((c) => c.fileId),
      ...(analysed?.matrix.sources.map((s) => s.fileId) ?? []),
    ]).size,
    rewritten: final.rewritten.length,
    dropped: final.dropped,
    rounds,
    verifyMs: Math.round(performance.now() - verifyStarted),
    totalMs: Math.round(performance.now() - runStarted),
    sql: verdict.sql,
    precheckSql: pre.sql,
    models: {
      planner: planned.model,
      writer: MODELS.writer.primary.id,
      verifier: verdict.model,
      ...(analysed ? { analyst: analysed.model } : {}),
    },
    memories: memories.map((m) => ({ id: m.id, content: m.content })),
    ...(analysed
      ? {
          analyst: {
            claims: analysed.matrix.counts.claims,
            sources: analysed.matrix.counts.sources,
            relations: analysed.worldModel.relations,
            sql: analysed.sql,
          },
        }
      : {}),
  }
  emit({ type: "receipt", receipt })
  tracer.log({
    agent: "system",
    step: "done",
    action: "answered",
    detail: {
      ...receipt,
      sql: undefined,
      precheckSql: undefined,
      analyst: receipt.analyst && { ...receipt.analyst, sql: undefined },
    },
  })
  await tracer.flush()
  return {
    status: "answered" as const,
    receipt,
    body: final.body,
    caveat: draft.caveat,
    citations: final.citations,
    quoteKeys: final.citations.map((c) => evidenceKey(c.quote)),
  }
}

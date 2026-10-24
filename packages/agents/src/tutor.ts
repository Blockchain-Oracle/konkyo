import { ZETARIS } from "@konkyo/config"
import { db } from "@konkyo/db"
import type { StudyCheck, StudyGround, StudyItemData, StudyKind } from "@konkyo/db/schema"
import { checkQuotes, sqlHash } from "@konkyo/zetaris"
import { generateText, Output } from "ai"
import { sql } from "drizzle-orm"
import { z } from "zod"
import { quoteKey } from "./citations"
import { recall as recallMemories } from "./memory"
import { MODELS, type ModelChoice, model, noFallback, reasoning } from "./models"
import { type Scope, scopeFileIds } from "./retrieve"
import type { Tracer } from "./trace"

/** A passage the Tutor reads, labelled so its answers can say where they come from. */
export type StudyPassage = {
  id: string
  fileId: string
  title: string
  ordinal: number
  page: number | null
  tStart: number | null
  text: string
}

/**
 * What the Tutor reads at once: one long passage, or a run of short ones (slides, a recording's
 * sentences) joined until there's enough to ask about. Answers still point at one passage.
 */
export type StudyWindow = {
  fileId: string
  title: string
  passages: StudyPassage[]
  centrality: number
}

/** An item that passed every check, ready to store. */
export type MadeItem = {
  kind: StudyKind
  topic: string
  prompt: string
  answer: string
  accepted: string[]
  hints: string[]
  why: string
  claim: string
  data: StudyItemData
  ground: StudyGround
  check: StudyCheck
}

const clean = (text: string) => text.replace(/\p{Cc}/gu, " ")

async function call<T>(
  role: "tutor" | "verifier" | "grader" | "analyst" | "writer",
  tracer: Tracer | undefined,
  step: string,
  fn: (choice: ModelChoice) => Promise<T>,
) {
  const { primary, fallback } = MODELS[role]
  try {
    return { result: await fn(primary), choice: primary }
  } catch (error) {
    if (noFallback(error)) throw error
    tracer?.log({
      agent: role === "tutor" || role === "grader" ? "tutor" : "verifier",
      step,
      action: "escalated_to_fallback",
      model: fallback.id,
      detail: { reason: (error as Error).message.slice(0, 300) },
    })
    return { result: await fn(fallback), choice: fallback }
  }
}

// ------------------------------------------------------------------ choosing what to ask about

/** Windows shorter than this are joined with the next passage; longer ones stand alone. */
const WINDOW_MIN = 600
const WINDOW_MAX = 2400

/** Reference lists, front matter and tables of numbers: nothing there is worth learning. */
export function looksLikeApparatus(text: string) {
  const words = text.split(/\s+/).length
  const years = text.match(/\b(19|20)\d{2}[a-z]?\b/g)?.length ?? 0
  // "Fett, P., Gomes, M.W.": 0.10-0.23 per word in reference lists, none in prose (in testing).
  const initials = text.match(/\b\p{Lu}[\p{Ll}'’-]+,\s(?:\p{Lu}\.\s?){1,3}/gu)?.length ?? 0
  const digits = text.replace(/[^\d]/g, "").length / Math.max(1, text.length)
  return (
    /^\s*(references|bibliography|acknowledg|funding|conflicts? of interest|author contributions)/i.test(
      text,
    ) ||
    (/doi\.org|https?:\/\//.test(text) && years > 3) ||
    years / Math.max(1, words) > 0.05 ||
    initials / Math.max(1, words) > 0.04 ||
    digits > 0.2
  )
}

function windowsOf(passages: (StudyPassage & { centrality: number })[]): StudyWindow[] {
  const out: StudyWindow[] = []
  let run: (StudyPassage & { centrality: number })[] = []
  const flush = () => {
    const first = run[0]
    if (first) {
      const text = run.map((p) => p.text).join(" ")
      if (text.length >= 250 && !looksLikeApparatus(text))
        out.push({
          fileId: first.fileId,
          title: first.title,
          passages: run.map(({ centrality: _, ...p }) => p),
          centrality: run.reduce((s, p) => s + p.centrality, 0) / run.length,
        })
    }
    run = []
  }
  for (const p of passages) {
    const length = run.reduce((s, r) => s + r.text.length, 0)
    if (run.length && (run[0]?.fileId !== p.fileId || length + p.text.length > WINDOW_MAX)) flush()
    run.push(p)
    if (run.reduce((s, r) => s + r.text.length, 0) >= WINDOW_MIN) flush()
  }
  flush()
  return out
}

/**
 * The windows a set asks about: in each file, the passages closest to what the file is about
 * (nearest its embedding centroid, so not the references or the acknowledgements), spread
 * across the file, with files taking turns so a folder's set covers every file.
 */
export async function pickWindows(
  ownerId: string,
  scope: Scope,
  count: number,
): Promise<{ windows: StudyWindow[]; fileIds: string[] }> {
  const fileIds = await scopeFileIds(ownerId, scope)
  if (fileIds && !fileIds.length) return { windows: [], fileIds: [] }
  const inScope = fileIds
    ? sql`and p.file_id in (${sql.join(
        fileIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`
    : sql``
  const rows = await db.execute<{
    id: string
    file_id: string
    title: string
    ordinal: number
    page: number | null
    t_start: number | null
    text: string
    centrality: number
  }>(sql`
    with scoped as (
      select p.id, p.file_id, f.title, p.ordinal, p.page, p.t_start, p.text, p.embedding
      from passages p join files f on f.id = p.file_id
      where p.owner_id = ${ownerId} and f.deleted_at is null and f.status = 'ready'
        and f.kind <> 'note' and p.kind in ('text', 'transcript') and p.embedding is not null
        ${inScope}
    ), centres as (select file_id, avg(embedding) as c from scoped group by file_id)
    select s.id, s.file_id, s.title, s.ordinal, s.page, s.t_start, s.text,
      1 - (s.embedding <=> c.c) as centrality
    from scoped s join centres c using (file_id)
    order by s.file_id, s.ordinal
    limit 6000
  `)
  const windows = windowsOf(
    rows.map((r) => ({
      id: r.id,
      fileId: r.file_id,
      title: r.title,
      ordinal: r.ordinal,
      page: r.page,
      tStart: r.t_start,
      text: clean(r.text),
      centrality: Number(r.centrality),
    })),
  )
  const byFile = new Map<string, StudyWindow[]>()
  for (const w of windows) byFile.set(w.fileId, [...(byFile.get(w.fileId) ?? []), w])
  // Files take turns, so each gets its share (a file with less to ask about gives way).
  const quota = new Map<string, number>()
  const files = [...byFile.keys()]
  for (
    let given = 0, i = 0;
    given < count && files.some((f) => (quota.get(f) ?? 0) < (byFile.get(f)?.length ?? 0));
    i++
  ) {
    const f = files[i % files.length] as string
    if ((quota.get(f) ?? 0) < (byFile.get(f)?.length ?? 0)) {
      quota.set(f, (quota.get(f) ?? 0) + 1)
      given++
    }
  }
  const picked: StudyWindow[] = []
  for (const [fileId, list] of byFile) {
    const n = quota.get(fileId) ?? 0
    if (!n) continue
    // The most central few, then evenly spaced through the file.
    const pool = [...list]
      .sort((a, b) => b.centrality - a.centrality)
      .slice(0, Math.max(n, n * 3))
      .sort((a, b) => (a.passages[0]?.ordinal ?? 0) - (b.passages[0]?.ordinal ?? 0))
    for (let k = 0; k < n; k++) {
      const w = pool[Math.floor((k * pool.length) / n)]
      if (w) picked.push(w)
    }
  }
  return { windows: picked, fileIds: fileIds ?? [...byFile.keys()] }
}

// ------------------------------------------------------------------ making items (F27)

const Quoted = z.object({
  passage: z.string().describe("The label of the passage the words are from, like p2"),
  words: z
    .string()
    .describe("8-40 consecutive words copied exactly from that passage that show the answer"),
})

const Hints = z
  .array(z.string())
  .describe(
    "Exactly two hints. The first points to the idea or where to look; the second narrows it down (a first letter, how many words, what it is contrasted with). Neither states the answer, a synonym of it, or a description that amounts to it.",
  )

const Why = z
  .string()
  .describe(
    "One or two sentences explaining why the answer is right, from the passage, ending with [1]",
  )

const Recall = z.object({
  question: z.string(),
  answer: z.string().describe("1-6 words"),
  point: z
    .string()
    .describe(
      "The fact the question tests, as one statement in your own words: nothing the quoted words don't say",
    ),
  accepted: z.array(z.string()).describe("Other ways to say the same answer (0-3)"),
  hints: Hints,
  quote: Quoted,
  why: Why,
})

const Cloze = z.object({
  passage: z.string().describe("The label of the passage the sentence is from"),
  sentence: z.string().describe("One sentence copied exactly from that passage"),
  blank: z
    .string()
    .describe("The 1-4 key words to blank out, copied exactly as they appear in the sentence"),
  hints: Hints,
  why: Why,
})

const Bundle = z.object({
  usable: z
    .boolean()
    .describe(
      "false when the passages hold no idea worth learning (front matter, references, acknowledgements, a list of numbers, a slide with only a title)",
    ),
  topic: z.string().describe("The concept, in 2-4 words (used to mix topics in a round)"),
  claim: z.string().describe("The passages' main point, in one plain sentence"),
  recall: Recall.nullable(),
  cloze: Cloze.nullable(),
  truefalse: z
    .object({
      passage: z.string().describe("The label of the passage the sentence is from"),
      original: z.string().describe("One sentence copied exactly from that passage"),
      statement: z.string().describe("The statement the student judges, as asked"),
      hints: Hints,
      why: Why,
    })
    .nullable(),
  order: z
    .object({
      process: z.string().describe("What the steps are steps of, as a short noun phrase"),
      steps: z.array(z.string()).describe("3-6 short steps, in their real order"),
      quote: Quoted,
      hints: Hints,
      why: Why,
    })
    .nullable()
    .describe(
      "Only when the passages describe a real sequence (stages, steps of a method, a mechanism in order); otherwise null",
    ),
})

const TUTOR_INSTRUCTIONS = `You write practice items for a student from their own course material, so they can test themselves.

Rules for every item:
- Ask about the ideas (what, why, how, what follows from what), never trivia: no figure, table, page or reference numbers, no author names, no publication years, no "according to the passage".
- Each question must make sense on its own to a student who has studied the material but can't see it now, and have exactly one right answer that the passages state.
- Copy quoted words, sentences and blanks exactly, character for character.
- Hints help the student get there without giving the answer away.
- Plain, short, friendly wording.

Items:
- recall: a short-answer question; the answer is 1-6 words.
- cloze: a sentence from the passages with its key term blanked (not a trivial word).
- truefalse: a statement made from one sentence of the passages. You'll be told whether to make it true (the same fact in other words) or false (change one specific, checkable detail: a direction, a number, a cause, a term; never a negation word alone).
- order: only for a real sequence.`

type Bundled = z.infer<typeof Bundle>

/**
 * A flashcard is a question and its answer: recall and cloze are required, and the other kinds
 * can only be null. With all four optional, Luna wrote a true/false and no card (in testing).
 */
const FlashcardBundle = Bundle.extend({
  recall: Recall,
  cloze: Cloze,
  truefalse: z.null(),
  order: z.null(),
})

/**
 * A practice set wants every game to have something to play: with recall and cloze optional, the
 * Tutor wrote only the true/false for 12 of 13 windows (in testing), leaving Recall Sprint and Find the
 * Evidence empty. Recall, cloze and true/false are required; order stays for real sequences.
 */
const SetBundle = Bundle.extend({
  recall: Recall,
  cloze: Cloze,
  truefalse: Bundle.shape.truefalse.unwrap(),
})

const VerifyResult = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      ok: z.boolean(),
      problem: z.string().describe("Empty when ok; else what's wrong, in one short sentence"),
    }),
  ),
})

const VERIFY_INSTRUCTIONS = `You check practice items against the passages they were made from, before a student sees them. Be strict: a wrong answer key teaches the wrong thing.

An item is ok only when all hold:
- The answer key is correct and stated by the passages (numbers, directions and terms exactly).
- The question has one right answer, and it is clear without seeing the passages (no "the passage", "this study" without saying which).
- It asks about an idea, not trivia (figure or page numbers, author names, years).
- For true/false: a "true" statement says what the passages say; a "false" one contradicts them in one specific detail.
- For order: the steps are in the order the passages give.
- The hints don't state the answer, and the explanation agrees with the passages.`

const labelled = (w: StudyWindow) => w.passages.map((p, i) => ({ label: `p${i + 1}`, passage: p }))

function passageText(w: StudyWindow) {
  return labelled(w)
    .map(({ label, passage }) => {
      const where =
        passage.tStart != null
          ? ` (at ${Math.floor(passage.tStart / 60)}:${String(Math.floor(passage.tStart % 60)).padStart(2, "0")})`
          : passage.page != null
            ? ` (page ${passage.page})`
            : ""
      return `[${label}]${where}\n${passage.text}`
    })
    .join("\n\n")
}

/** The passage a label names, if the quoted words really are in it. */
function located(w: StudyWindow, label: string | undefined, words: string) {
  const key = quoteKey(words)
  if (key.length < 12) return undefined
  const named = labelled(w).find((l) => l.label === label?.trim())?.passage
  if (named && quoteKey(named.text).includes(key)) return named
  // A model sometimes names the wrong label for words it did copy exactly.
  return w.passages.find((p) => quoteKey(p.text).includes(key))
}

const groundOf = (p: StudyPassage, quote: string): StudyGround => ({
  fileId: p.fileId,
  passageId: p.id,
  page: p.page,
  tStart: p.tStart,
  quote: quote.trim(),
})

type Draft = Omit<MadeItem, "check"> & { id: string }

/**
 * The bundle's items that pass the code checks (quotes, sentences and blanks really in the
 * source), and why each other one failed: the trace says where a window's items went.
 */
function draftsOf(w: StudyWindow, b: Bundled, makeFalse: boolean, key: string) {
  const drafts: Draft[] = []
  const failed: Record<string, string> = {}
  const base = { topic: b.topic.trim(), claim: b.claim.trim() }
  if (b.recall) {
    const at = located(w, b.recall.quote.passage, b.recall.quote.words)
    if (!at) failed.recall = "quote not in the passages"
    else if (!b.recall.answer.trim()) failed.recall = "no answer"
    else
      drafts.push({
        id: `${key}-recall`,
        kind: "recall",
        ...base,
        claim: b.recall.point.trim() || base.claim,
        prompt: b.recall.question.trim(),
        answer: b.recall.answer.trim(),
        accepted: b.recall.accepted
          .map((a) => a.trim())
          .filter(Boolean)
          .slice(0, 4),
        hints: b.recall.hints.slice(0, 2),
        why: b.recall.why.trim(),
        data: {},
        ground: groundOf(at, b.recall.quote.words),
      })
  }
  if (b.cloze) {
    const sentence = b.cloze.sentence.trim()
    const blank = b.cloze.blank.trim()
    const at = located(w, b.cloze.passage, sentence)
    const index = sentence.indexOf(blank)
    if (!at) failed.cloze = "sentence not in the passages"
    else if (!blank || index === -1) failed.cloze = "blank not in the sentence"
    else if (blank.length >= sentence.length / 2) failed.cloze = "blank too long"
    else
      drafts.push({
        id: `${key}-cloze`,
        kind: "cloze",
        ...base,
        prompt: `${sentence.slice(0, index)}____${sentence.slice(index + blank.length)}`,
        answer: blank,
        accepted: [],
        hints: b.cloze.hints.slice(0, 2),
        why: b.cloze.why.trim(),
        data: {},
        ground: groundOf(at, sentence),
      })
  }
  if (b.truefalse) {
    const original = b.truefalse.original.trim()
    const at = located(w, b.truefalse.passage, original)
    const statement = b.truefalse.statement.trim()
    // A "false" statement identical to its sentence isn't false.
    const changed = quoteKey(statement) !== quoteKey(original)
    if (!at) failed.truefalse = "sentence not in the passages"
    else if (!statement || (makeFalse && !changed)) failed.truefalse = "false statement unchanged"
    else
      drafts.push({
        id: `${key}-truefalse`,
        kind: "truefalse",
        ...base,
        // A true statement is its sentence in other words: Find the Evidence can ask it.
        ...(makeFalse ? {} : { claim: statement }),
        prompt: statement,
        answer: makeFalse ? "false" : "true",
        accepted: [],
        hints: b.truefalse.hints.slice(0, 2),
        why: b.truefalse.why.trim(),
        data: { original, isTrue: !makeFalse },
        ground: groundOf(at, original),
      })
  }
  if (b.order) {
    const at = located(w, b.order.quote.passage, b.order.quote.words)
    if (b.order.steps.length < 3 || b.order.steps.length > 6) failed.order = "not 3-6 steps"
    else if (!at) failed.order = "quote not in the passages"
    else
      drafts.push({
        id: `${key}-order`,
        kind: "order",
        ...base,
        prompt: b.order.process.trim(),
        answer: b.order.steps.map((s) => s.trim()).join(" → "),
        accepted: [],
        hints: b.order.hints.slice(0, 2),
        why: b.order.why.trim(),
        data: { steps: b.order.steps.map((s) => s.trim()) },
        ground: groundOf(at, b.order.quote.words),
      })
  }
  const complete = drafts.filter((d) => {
    const ok = d.hints.length === 2 && d.prompt && d.why
    if (!ok)
      failed[d.kind] =
        d.hints.length === 2 ? "missing a question or explanation" : `${d.hints.length} hints`
    return ok
  })
  return { drafts: complete, failed }
}

function describeDraft(d: Draft) {
  if (d.kind === "truefalse")
    return `[${d.id}] true/false. Statement: ${d.prompt}\nKey: ${d.answer}\nHints: ${d.hints.join(" | ")}\nExplanation: ${d.why}`
  if (d.kind === "order")
    return `[${d.id}] order the steps of: ${d.prompt}\nKey (in order): ${d.data.steps?.join(" → ")}\nHints: ${d.hints.join(" | ")}\nExplanation: ${d.why}`
  const point =
    d.kind === "recall" ? `\nPoint (must be stated by the quoted passage): ${d.claim}` : ""
  return `[${d.id}] ${d.kind === "cloze" ? "fill the blank" : "question"}: ${d.prompt}\nKey: ${d.answer}${d.accepted.length ? ` (also: ${d.accepted.join("; ")})` : ""}${point}\nHints: ${d.hints.join(" | ")}\nExplanation: ${d.why}`
}

/** The Verifier's call on a window's drafts: only the ones it passes go on. */
async function verifyDrafts(w: StudyWindow, drafts: Draft[], tracer?: Tracer) {
  if (!drafts.length)
    return { passed: [] as Draft[], verdicts: new Map<string, string>(), model: "" }
  const { result, choice } = await call("verifier", tracer, "verify-items", (c) =>
    generateText({
      model: model(c),
      providerOptions: reasoning(c),
      output: Output.object({ schema: VerifyResult }),
      instructions: VERIFY_INSTRUCTIONS,
      prompt: `Passages:\n${passageText(w)}\n\nItems:\n${drafts.map(describeDraft).join("\n\n")}`,
    }),
  )
  const verdicts = new Map(
    result.output.items.map((i) => [i.id.replace(/^\[|\]$/g, ""), i.ok ? "ok" : i.problem]),
  )
  return {
    passed: drafts.filter((d) => verdicts.get(d.id) === "ok"),
    verdicts,
    model: choice.id,
  }
}

/** Zetaris confirms each quote in its own reading of the source, in one statement. */
async function confirmInZetaris(drafts: Draft[], tracer: Tracer | undefined, step: string) {
  const checks = drafts.flatMap((d) => {
    const grounds = [d.ground, ...(d.data.other ? [d.data.other] : [])]
    return grounds.map((g, i) => ({
      qid: `${d.id}#${i}`,
      fileId: g.fileId,
      passageId: g.passageId,
      quote: g.quote,
      transcript: g.page == null,
    }))
  })
  const zetaris = await checkQuotes(checks, { timeoutMs: ZETARIS.backgroundTimeoutMs })
  tracer?.log({
    agent: "verifier",
    step,
    action: "queried_zetaris",
    sqlHash: zetaris.sql ? sqlHash(zetaris.sql) : undefined,
    rowsReturned: zetaris.rows,
    latencyMs: zetaris.ms,
    detail: { checked: checks.length, found: zetaris.found.size },
  })
  const ok = (d: Draft) =>
    checks.filter((c) => c.qid.startsWith(`${d.id}#`)).every((c) => zetaris.found.has(c.qid))
  return { ok, sql: zetaris.sql }
}

export type WindowResult = { items: MadeItem[]; dropped: number; usable: boolean }

/**
 * One window → its items (plan F27): the Tutor drafts them; code checks every quote, sentence
 * and blank against the passage; the Verifier checks every answer key; Zetaris confirms every
 * quote in its own reading of the source. Only items that pass all three are kept.
 */
export async function makeItems(
  w: StudyWindow,
  options: {
    corrections?: string[]
    tracer?: Tracer
    key: string
    /** Make a flashcard: ask only about the words the person selected. */
    focus?: string
    /** Whose library to draw Find the Evidence options from (none for a quick flashcard). */
    ownerId?: string
  },
): Promise<WindowResult> {
  const { tracer, key, focus, ownerId } = options
  const makeFalse = Math.random() < 0.65
  const started = performance.now()
  const corrections = options.corrections?.length
    ? `\n\nThe student flagged earlier items as wrong; don't repeat these mistakes:\n${options.corrections.map((c) => `- ${c}`).join("\n")}`
    : ""
  const { result, choice } = await call("tutor", tracer, "make-items", (c) =>
    generateText({
      model: model(c),
      providerOptions: reasoning(c),
      // Both are Bundle with some parts required (never a different shape), so read as Bundle.
      output: Output.object({
        schema: (focus ? FlashcardBundle : SetBundle) as unknown as typeof Bundle,
      }),
      instructions: TUTOR_INSTRUCTIONS + corrections,
      prompt: focus
        ? `From "${w.title}". These become flashcards: ask only about this part, which the student selected: "${clean(focus).slice(0, 1200)}"\n\n${passageText(w)}`
        : `From "${w.title}". Make the true/false statement ${makeFalse ? "FALSE" : "TRUE"}.\n\n${passageText(w)}`,
    }),
  )
  const bundle = result.output
  const { drafts, failed } = bundle.usable
    ? draftsOf(w, bundle, makeFalse, key)
    : { drafts: [], failed: {} }
  const parts = {
    recall: bundle.recall,
    cloze: bundle.cloze,
    truefalse: bundle.truefalse,
    order: bundle.order,
  }
  tracer?.log({
    agent: "tutor",
    step: "make-items",
    action: bundle.usable ? "drafted_items" : "skipped_window",
    model: choice.id,
    latencyMs: Math.round(performance.now() - started),
    tokens: { input: result.usage.inputTokens, output: result.usage.outputTokens },
    detail: {
      fileId: w.fileId,
      passages: w.passages.map((p) => p.id),
      topic: bundle.topic,
      // Per part: drafted, not written ("none"), or why the code checks dropped it.
      parts: Object.fromEntries(
        Object.entries(parts).map(([kind, part]) => [
          kind,
          part ? (failed[kind] ?? "drafted") : "none",
        ]),
      ),
    },
  })
  if (!bundle.usable) return { items: [], dropped: 0, usable: false }
  const codeDropped = Object.keys(failed).length
  const { passed, verdicts, model: verifierModel } = await verifyDrafts(w, drafts, tracer)
  tracer?.log({
    agent: "verifier",
    step: "verify-items",
    action: "checked_answer_keys",
    model: verifierModel,
    verdict: `${passed.length}/${drafts.length} passed`,
    detail: Object.fromEntries(verdicts),
  })
  const zetaris = await confirmInZetaris(passed, tracer, "verify-items")
  const kept = passed.filter(zetaris.ok)
  if (ownerId)
    await Promise.all(
      kept.filter(asksEvidence).map(async (d) => {
        const distractors = await evidenceOptions(ownerId, d, tracer).catch(() => [])
        if (distractors.length === EVIDENCE_OPTIONS) d.data = { ...d.data, distractors }
      }),
    )
  return {
    items: kept.map(({ id: _, ...d }) => ({
      ...d,
      check: { code: true, zetaris: true, verifier: "ok", model: verifierModel },
    })),
    dropped: codeDropped + (drafts.length - kept.length),
    usable: true,
  }
}

// ------------------------------------------------------------------ find the evidence (F30)

const EVIDENCE_OPTIONS = 3

/**
 * Items whose claim is their own: a recall item's point, or a true statement (its sentence in
 * other words). A cloze sentence is the source verbatim; a false statement isn't what any passage says.
 */
export const asksEvidence = (item: { kind: StudyKind; data: StudyItemData }) =>
  item.kind === "recall" || (item.kind === "truefalse" && Boolean(item.data.isTrue))

const Stated = z.object({
  states: z
    .array(z.number())
    .describe("The numbers of the passages that state the claim, in any words"),
})

/**
 * Wrong options for Find the Evidence, chosen once when the item is made: real, similar passages
 * (prose, never a reference list), at most one from the item's own file, and none that the
 * Verifier finds also states the claim. Nearest-by-meaning alone let another paper's "outcomes are
 * attributed to caffeine's effect on adenosine receptors" sit beside the right answer (in testing).
 */
export async function evidenceOptions(
  ownerId: string,
  item: { claim: string; ground: StudyGround },
  tracer?: Tracer,
): Promise<string[]> {
  const nearest = (sameFile: boolean, limit: number) =>
    db.execute<{ id: string; file_id: string; text: string }>(sql`
      select o.id, o.file_id, o.text
      from passages s, passages o join files f on f.id = o.file_id
      where s.id = ${item.ground.passageId} and o.owner_id = ${ownerId} and f.deleted_at is null
        and f.kind <> 'note' and o.id <> s.id and o.kind in ('text', 'transcript')
        and length(o.text) > 160 and o.embedding is not null
        and ${sameFile ? sql`o.file_id = s.file_id and abs(o.ordinal - s.ordinal) > 1` : sql`o.file_id <> s.file_id`}
      order by o.embedding <=> s.embedding
      limit ${limit}
    `)
  const [same, other] = await Promise.all([nearest(true, 6), nearest(false, 10)])
  const prose = (rows: typeof same) => rows.filter((r) => !looksLikeApparatus(r.text)).slice(0, 4)
  const candidates = [...prose(same), ...prose(other)]
  if (candidates.length < EVIDENCE_OPTIONS) return []
  const { result, choice } = await call("verifier", tracer, "evidence-options", (c) =>
    generateText({
      model: model(c),
      providerOptions: reasoning(c),
      output: Output.object({ schema: Stated }),
      instructions:
        "A student will be asked which passage states a claim. List every passage that states it: the same fact in any words, or a broader statement that includes it. A passage that is only on the same topic doesn't state it.",
      prompt: `Claim: ${item.claim}\n\n${candidates.map((p, i) => `[${i + 1}] ${clean(p.text).slice(0, 1200)}`).join("\n\n")}`,
    }),
  )
  const stating = new Set(result.output.states.map((n) => candidates[n - 1]?.id))
  const free = candidates.filter((p) => !stating.has(p.id))
  const own = free.filter((p) => p.file_id === item.ground.fileId)
  const elsewhere = free.filter((p) => p.file_id !== item.ground.fileId)
  // At most one from the item's own file, unless the library has nowhere else to look.
  const picked = [...own.slice(0, 1), ...elsewhere, ...own.slice(1)].slice(0, EVIDENCE_OPTIONS)
  tracer?.log({
    agent: "verifier",
    step: "evidence-options",
    action: "checked_distractors",
    model: choice.id,
    verdict: `${stating.size} of ${candidates.length} also state it`,
    detail: { passage: item.ground.passageId, picked: picked.map((p) => p.id) },
  })
  return picked.map((p) => p.id)
}

// ------------------------------------------------------------------ compare the sources (F30)

// Field order is generation order: each side's position is written down before the relation,
// so the call follows from the two claims (with `relation` first it said "agree" to a shared topic).
const Comparison = z.object({
  point: z
    .string()
    .describe(
      "The one specific point both speak to, as a neutral question (doesn't hint at the answer)",
    ),
  a: z.string().describe("8-40 words copied exactly from source A that show its position"),
  b: z.string().describe("8-40 words copied exactly from source B that show its position"),
  aSays: z.string().describe("Source A's claim on the point, in one short sentence"),
  bSays: z.string().describe("Source B's claim on the point, in one short sentence"),
  relation: z
    .enum(["agree", "disagree", "neither"])
    .describe(
      "agree: aSays and bSays make the same claim. disagree: they conflict. neither: one of them makes no claim on the point, or they talk about different things",
    ),
  hints: Hints,
  why: z
    .string()
    .describe("One or two sentences: what each says on the point, citing A as [1] and B as [2]"),
  topic: z.string().describe("The concept, in 2-4 words"),
})

type Neighbour = StudyPassage & { similarity: number }

/** The closest passage on the same subject in another of the files. */
async function neighbourIn(ownerId: string, p: StudyPassage, fileIds: string[]) {
  const others = fileIds.filter((id) => id !== p.fileId)
  if (!others.length) return undefined
  const rows = await db.execute<{
    id: string
    file_id: string
    title: string
    ordinal: number
    page: number | null
    t_start: number | null
    text: string
    similarity: number
  }>(sql`
    select n.id, n.file_id, f.title, n.ordinal, n.page, n.t_start, n.text,
      1 - (n.embedding <=> s.embedding) as similarity
    from passages s, passages n join files f on f.id = n.file_id
    where s.id = ${p.id} and n.owner_id = ${ownerId} and f.deleted_at is null
      and n.kind in ('text', 'transcript') and length(n.text) > 200 and n.embedding is not null
      and n.file_id in (${sql.join(
        others.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
    order by n.embedding <=> s.embedding
    limit 1
  `)
  const r = rows[0]
  if (!r || looksLikeApparatus(r.text)) return undefined
  return {
    id: r.id,
    fileId: r.file_id,
    title: r.title,
    ordinal: r.ordinal,
    page: r.page,
    tStart: r.t_start,
    text: clean(r.text),
    similarity: Number(r.similarity),
  } satisfies Neighbour
}

/**
 * Compare the Sources (F30): two sources on one point, where they really agree or disagree.
 * Pairs are the closest passages across files; the Analyst says how they relate and quotes each;
 * both quotes are checked in code and in Zetaris, and the Verifier checks the call.
 */
export async function makeComparisons(
  ownerId: string,
  windows: StudyWindow[],
  fileIds: string[],
  options: { tracer?: Tracer; want: number },
): Promise<MadeItem[]> {
  const { tracer, want } = options
  if (new Set(fileIds).size < 2) return []
  const seeds = windows
    .map((w) => [...w.passages].sort((a, b) => b.text.length - a.text.length)[0])
    .filter((p): p is StudyPassage => Boolean(p && p.text.length > 200))
    .slice(0, want * 2)
  const made: MadeItem[] = []
  for (const a of seeds) {
    if (made.length >= want) break
    const b = await neighbourIn(ownerId, a, fileIds)
    // Below 0.6 the pair only shares a subject; above 0.9 it's the same text in two files
    // (a scan and its digital copy, a repost), which "agrees" with itself.
    if (!b || b.similarity < 0.6 || b.similarity > 0.9) continue
    const { result, choice } = await call("analyst", tracer, "compare", (c) =>
      generateText({
        model: model(c),
        providerOptions: reasoning(c),
        output: Output.object({ schema: Comparison }),
        instructions:
          "Two passages from different sources. Find one specific point both make a claim about, quote each exactly, state each one's claim, then say whether they agree or disagree. neither when either makes no claim on that point, or when they only share a subject. Be strict both ways: different emphasis isn't disagreement, and a shared topic isn't agreement.",
        prompt: `[A] "${a.title}"\n${a.text}\n\n[B] "${b.title}"\n${b.text}`,
      }),
    )
    const cmp = result.output
    tracer?.log({
      agent: "analyst",
      step: "compare",
      action: "compared_sources",
      model: choice.id,
      verdict: cmp.relation,
      detail: { a: a.id, b: b.id, similarity: Math.round(b.similarity * 100) / 100 },
    })
    if (cmp.relation === "neither") continue
    if (!quoteKey(a.text).includes(quoteKey(cmp.a)) || !quoteKey(b.text).includes(quoteKey(cmp.b)))
      continue
    if (quoteKey(cmp.a).length < 12 || quoteKey(cmp.b).length < 12) continue
    const draft: Draft = {
      id: `cmp-${made.length}`,
      kind: "compare",
      topic: cmp.topic.trim(),
      claim: cmp.point.trim(),
      prompt: cmp.point.trim(),
      answer: cmp.relation,
      accepted: [],
      hints: cmp.hints.slice(0, 2),
      why: cmp.why.trim(),
      data: { relation: cmp.relation, other: groundOf(b, cmp.b) },
      ground: groundOf(a, cmp.a),
    }
    const pairWindow: StudyWindow = {
      fileId: a.fileId,
      title: a.title,
      passages: [a, b],
      centrality: 0,
    }
    const { passed, model: verifierModel } = await verifyDrafts(
      pairWindow,
      [{ ...draft, prompt: `Do the sources agree or disagree: ${draft.prompt}` }],
      tracer,
    )
    if (!passed.length) continue
    const zetaris = await confirmInZetaris([draft], tracer, "compare")
    if (!zetaris.ok(draft)) continue
    const { id: _, ...item } = draft
    made.push({
      ...item,
      check: { code: true, zetaris: true, verifier: "ok", model: verifierModel },
    })
  }
  return made
}

/** Corrections the person made to earlier items, for the Tutor to read first (F33). */
export async function tutorCorrections(ownerId: string, about: string) {
  const recalled = await recallMemories(ownerId, about, 4).catch(() => [])
  return recalled.map((r) => r.content)
}

// ------------------------------------------------------------------ grading (F28)

const Graded = z.object({
  verdict: z.enum(["right", "close", "wrong"]),
  feedback: z
    .string()
    .describe(
      "One short sentence to the student. Never state or paraphrase the answer. close: what's missing. wrong: what to reconsider.",
    ),
})

export type GradeInput = {
  kind: StudyKind
  prompt: string
  answer: string
  accepted: string[]
  quote: string
  given: string
  /** truefalse rewrites: the source's own sentence. */
  original?: string
}

/**
 * A typed answer the code couldn't settle (F28). right: the same meaning as the key, in any
 * words, minor slips forgiven; close: on the way but missing something the key needs.
 */
export async function gradeAnswer(input: GradeInput, tracer?: Tracer) {
  const task =
    input.kind === "truefalse"
      ? `The student was shown a false statement and asked to rewrite it so it's true.\nFalse statement: ${input.prompt}\nThe source says: ${input.original}\nThe student's rewrite: ${input.given}\n\nright: their rewrite fixes the wrong detail so it agrees with the source (wording can differ).`
      : `Question: ${input.prompt}\nAnswer key: ${input.answer}${input.accepted.length ? ` (also accepted: ${input.accepted.join("; ")})` : ""}\nFrom the source: "${input.quote}"\nThe student's answer: ${input.given}`
  const { result, choice } = await call("grader", tracer, "grade", (c) =>
    generateText({
      model: model(c),
      providerOptions: reasoning(c),
      output: Output.object({ schema: Graded }),
      instructions:
        "You grade a student's answer to a practice question. right: it means the same as the key (other words, minor misspellings fine). close: partly there, or too vague to count. wrong: a different or contradicting answer. Feedback is one short, kind sentence that never gives the answer away.",
      prompt: task,
    }),
  )
  tracer?.log({
    agent: "tutor",
    step: "grade",
    action: "graded_answer",
    model: choice.id,
    verdict: result.output.verdict,
  })
  return result.output
}

// ------------------------------------------------------------------ This is wrong / Edit (F27)

const Recheck = z.object({
  wrong: z.boolean().describe("true when the item's answer key or question is wrong or misleading"),
  why: z.string().describe("One short sentence, quoting the passage where it helps"),
})

export type ItemForCheck = {
  kind: StudyKind
  prompt: string
  answer: string
  accepted: string[]
  data: StudyItemData
  passage: string
  otherPassage?: string
}

const describeItem = (i: ItemForCheck) =>
  i.kind === "truefalse"
    ? `True/false. Statement: ${i.prompt}\nKey: ${i.answer}`
    : i.kind === "order"
      ? `Order the steps of: ${i.prompt}\nKey: ${i.data.steps?.join(" → ")}`
      : i.kind === "compare"
        ? `Do the two sources agree or disagree: ${i.prompt}\nKey: ${i.answer}`
        : `Question: ${i.prompt}\nKey: ${i.answer}${i.accepted.length ? ` (also: ${i.accepted.join("; ")})` : ""}`

/**
 * "This is wrong" (F27): the Verifier looks again with the person's reason. If it agrees, the
 * item goes and the correction is remembered; if not, the person sees what the source says.
 */
export async function recheckItem(item: ItemForCheck, reason: string | undefined, tracer?: Tracer) {
  const { result, choice } = await call("verifier", tracer, "recheck", (c) =>
    generateText({
      model: model(c),
      providerOptions: reasoning(c),
      output: Output.object({ schema: Recheck }),
      instructions: `${VERIFY_INSTRUCTIONS}\n\nA student says this item is wrong. Take their reason seriously but decide from the passage.`,
      prompt: `Passage:\n${clean(item.passage)}${item.otherPassage ? `\n\nSecond source:\n${clean(item.otherPassage)}` : ""}\n\nItem:\n${describeItem(item)}\n\nThe student's reason: ${reason?.trim() || "(none given)"}`,
    }),
  )
  tracer?.log({
    agent: "verifier",
    step: "recheck",
    action: "rechecked_item",
    model: choice.id,
    verdict: result.output.wrong ? "wrong" : "stands",
  })
  return { ...result.output, model: choice.id }
}

/** An edited item, checked against its passage before it's saved (F27). */
export async function checkEdit(item: ItemForCheck, tracer?: Tracer) {
  const { result, choice } = await call("verifier", tracer, "check-edit", (c) =>
    generateText({
      model: model(c),
      providerOptions: reasoning(c),
      output: Output.object({ schema: VerifyResult }),
      instructions: VERIFY_INSTRUCTIONS,
      prompt: `Passages:\n${clean(item.passage)}${item.otherPassage ? `\n\n${clean(item.otherPassage)}` : ""}\n\nItems:\n[edit] ${describeItem(item)}`,
    }),
  )
  const verdict = result.output.items[0]
  return { ok: Boolean(verdict?.ok), problem: verdict?.problem ?? "", model: choice.id }
}

// ------------------------------------------------------------------ lecture → notes (F32)

const LectureNotes = z.object({
  title: z.string().describe("A short title for the notes"),
  sections: z
    .array(
      z.object({
        heading: z.string(),
        points: z
          .array(
            z.object({
              text: z.string().describe("One point, in a full sentence, in your own words"),
              passage: z.string().describe("The label of the passage it comes from, like t12"),
              quote: z.string().describe("6-30 consecutive words copied exactly from that passage"),
            }),
          )
          .max(8),
      }),
    )
    .max(10),
})

export type NotePoint = { text: string; passage: StudyPassage; quote: string }
export type LectureNotesResult = {
  title: string
  sections: { heading: string; points: NotePoint[] }[]
  dropped: number
  sql: string
}

/**
 * Lecture → notes (F32): the recording's (or slides') passages become sectioned notes, each
 * point citing the moment it comes from. Every quote is checked in code and in Zetaris; a point
 * whose quote fails is left out rather than cited wrongly.
 */
export async function makeNotes(
  passages: StudyPassage[],
  title: string,
  tracer?: Tracer,
): Promise<LectureNotesResult> {
  const labelledPassages = passages.map((p, i) => ({ label: `t${i + 1}`, p }))
  // About 15k tokens of material: an hour-long lecture fits whole.
  let budget = 60_000
  const shown = labelledPassages.filter(({ p }) => {
    budget -= p.text.length
    return budget > 0
  })
  const { result, choice } = await call("writer", tracer, "notes", (c) =>
    generateText({
      model: model(c),
      providerOptions: reasoning(c),
      output: Output.object({ schema: LectureNotes }),
      instructions:
        "Write study notes from this material: sections in the order it's taught, each with the key points a student needs (definitions, mechanisms, findings, examples). Each point is your own clear sentence and cites the passage it comes from with words copied exactly. Leave out greetings, logistics and filler.",
      prompt: `"${title}"\n\n${shown
        .map(({ label, p }) => {
          const at =
            p.tStart != null
              ? ` (${Math.floor(p.tStart / 60)}:${String(Math.floor(p.tStart % 60)).padStart(2, "0")})`
              : p.page != null
                ? ` (page ${p.page})`
                : ""
          return `[${label}]${at} ${clean(p.text)}`
        })
        .join("\n")}`,
    }),
  )
  const byLabel = new Map(labelledPassages.map((l) => [l.label, l.p]))
  let dropped = 0
  const sections = result.output.sections.map((s) => ({
    heading: s.heading.trim(),
    points: s.points.flatMap((pt) => {
      const named = byLabel.get(pt.passage.trim())
      const key = quoteKey(pt.quote)
      const at =
        named && quoteKey(named.text).includes(key)
          ? named
          : passages.find((p) => key.length >= 12 && quoteKey(p.text).includes(key))
      if (!at || key.length < 12) {
        dropped++
        return []
      }
      return [{ text: pt.text.trim(), passage: at, quote: pt.quote.trim() }]
    }),
  }))
  const points = sections.flatMap((s) => s.points)
  const zetaris = await checkQuotes(
    points.map((pt, i) => ({
      qid: `n${i}`,
      fileId: pt.passage.fileId,
      passageId: pt.passage.id,
      quote: pt.quote,
      transcript: pt.passage.page == null,
    })),
    { timeoutMs: ZETARIS.backgroundTimeoutMs },
  )
  tracer?.log({
    agent: "verifier",
    step: "notes",
    action: "queried_zetaris",
    model: choice.id,
    sqlHash: zetaris.sql ? sqlHash(zetaris.sql) : undefined,
    rowsReturned: zetaris.rows,
    detail: { points: points.length, found: zetaris.found.size },
  })
  let i = 0
  const verified = sections
    .map((s) => ({
      ...s,
      points: s.points.filter(() => {
        const ok = zetaris.found.has(`n${i++}`)
        if (!ok) dropped++
        return ok
      }),
    }))
    .filter((s) => s.points.length)
  return {
    title: result.output.title.trim() || title,
    sections: verified,
    dropped,
    sql: zetaris.sql,
  }
}

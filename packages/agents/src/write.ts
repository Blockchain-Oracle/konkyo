import { checkQuotes, sqlHash } from "@konkyo/zetaris"
import { generateText, Output } from "ai"
import { z } from "zod"
import { quoteKey } from "./citations"
import { type ModelChoice, model, noFallback, reasoning, withFallback } from "./models"
import { type Candidate, hybridSearch } from "./retrieve"
import type { Tracer } from "./trace"

/** Where a claim's support was found: enough to cite it and open it. */
export type FoundPassage = {
  fileId: string
  passageId: string
  title: string
  kind: string
  page: number | null
  tStart: number | null
  byline?: string
  text: string
}

export type Verdict = "supported" | "partly" | "contradicted" | "not-found"

export type ClaimResult = {
  id: string
  /** The claim's words exactly as they are in the draft (where its mark goes). */
  sentence: string
  claim: string
  verdict: Verdict
  why: string
  passage?: FoundPassage
  quote?: string
  /** The quote was found in Zetaris's own reading of the source. */
  verified?: boolean
}

export type CheckEvent =
  | { type: "claims"; claims: { id: string; sentence: string; claim: string }[] }
  | { type: "result"; result: ClaimResult }
  | { type: "done"; counts: Record<Verdict, number>; sql: string; ms: number }

const passageOf = (c: Candidate): FoundPassage => ({
  fileId: c.fileId,
  passageId: c.id,
  title: c.title,
  kind: c.kind,
  page: c.page,
  tStart: c.tStart,
  byline: c.byline,
  text: c.text,
})

const clean = (text: string) => text.replace(/\p{Cc}/gu, " ")

const call = <T>(
  role: "verifier" | "writer",
  tracer: Tracer,
  step: string,
  fn: (choice: ModelChoice) => Promise<T>,
) => withFallback(role, "verifier", tracer, step, fn)

// ------------------------------------------------------------------ Check my draft (F23)

const Claims = z.object({
  claims: z
    .array(
      z.object({
        sentence: z.string().describe("The sentence exactly as written in the draft"),
        claim: z.string().describe("Its factual claim, stated plainly in one sentence"),
      }),
    )
    .max(20),
})

const Judged = z.object({
  verdict: z.enum(["supported", "partly", "contradicted", "not-found"]),
  passage: z
    .string()
    .nullable()
    .describe("The label of the passage that supports (or contradicts) it, like p2"),
  quote: z
    .string()
    .nullable()
    .describe("5-30 consecutive words copied exactly from that passage that show it"),
  why: z.string().describe("One short sentence: what the passage says, or what's missing"),
})

/**
 * Check my draft (plan F23): every factual claim in the draft is looked for in the library's
 * sources (never the person's own notes, which would be circular). A claim is "supported" only
 * when a passage states it and an exact quote from that passage is found in code and in
 * Zetaris; "partly" when the passage supports part of it; "contradicted" when a passage says
 * otherwise (shown with that passage, since a draft should know); else "not found", with a way
 * to find a source.
 */
export async function checkDraft(
  ownerId: string,
  text: string,
  tracer: Tracer,
  emit: (event: CheckEvent) => void,
) {
  const started = performance.now()
  const draft = clean(text)
  const { result: extracted, choice } = await call("writer", tracer, "claims", (c) =>
    generateText({
      model: model(c),
      providerOptions: reasoning(c),
      output: Output.object({ schema: Claims }),
      instructions:
        "List the factual claims in this draft: statements about the world that a source could support or contradict (findings, numbers, definitions, causes). Skip opinions, plans, questions and the writer's own framing. Copy each sentence exactly as written.",
      prompt: draft.slice(0, 30_000),
    }),
  )
  const claims = extracted.output.claims
    .filter((c) => c.sentence.trim().length > 8 && draft.includes(c.sentence.trim()))
    .map((c, i) => ({ id: `c${i + 1}`, sentence: c.sentence.trim(), claim: c.claim.trim() }))
  tracer.log({
    agent: "verifier",
    step: "claims",
    action: "extracted_claims",
    model: choice.id,
    rowsReturned: claims.length,
    tokens: { input: extracted.usage.inputTokens, output: extracted.usage.outputTokens },
  })
  emit({ type: "claims", claims })

  const results: ClaimResult[] = []
  const queue = [...claims]
  const checkOne = async (claim: (typeof claims)[number]) => {
    const { candidates } = await hybridSearch(ownerId, [claim.claim], {}, 6, {
      excludeNotes: true,
    })
    const best = Math.max(0, ...candidates.map((c) => c.similarity))
    let result: ClaimResult = {
      ...claim,
      verdict: "not-found",
      why: "Nothing in your sources speaks to this.",
    }
    if (candidates.length && best >= 0.25) {
      const labelled = candidates.map((c, i) => ({ label: `p${i + 1}`, c }))
      const { result: judged } = await call("verifier", tracer, "support", (c) =>
        generateText({
          model: model(c),
          providerOptions: reasoning(c),
          output: Output.object({ schema: Judged }),
          instructions:
            "Decide whether the passages support the claim. supported: a passage states it, including any numbers. partly: a passage supports part of it, or a weaker version. contradicted: a passage states the opposite or a conflicting finding. not-found: none speak to it. Be strict about numbers and scope. The quote must be copied exactly from the passage you name.",
          prompt: `Claim: ${claim.claim}\n\nPassages:\n${labelled
            .map((l) => `[${l.label}] (${l.c.title})\n${clean(l.c.text)}`)
            .join("\n\n")}`,
        }),
      )
      const j = judged.output
      const hit = labelled.find((l) => l.label === j.passage?.trim())?.c
      const quoteOk =
        hit &&
        j.quote &&
        quoteKey(j.quote).length > 10 &&
        quoteKey(hit.text).includes(quoteKey(j.quote))
      result =
        j.verdict !== "not-found" && hit && quoteOk
          ? {
              ...claim,
              verdict: j.verdict,
              why: j.why,
              passage: passageOf(hit),
              quote: j.quote?.trim(),
            }
          : {
              ...claim,
              verdict: "not-found",
              why: j.verdict === "not-found" ? j.why : "No passage could be quoted for it.",
            }
    }
    results.push(result)
    emit({ type: "result", result })
  }
  // A claim whose search or judgement fails (an embedding or model outage) goes to the back of
  // the queue once, so one bad moment doesn't stop the others; a second failure ends the check.
  const retried = new Set<string>()
  let failure: unknown
  const work = async () => {
    for (;;) {
      const claim = queue.shift()
      if (!claim) return
      try {
        await checkOne(claim)
      } catch (error) {
        if (noFallback(error)) throw error
        if (retried.has(claim.id)) failure ??= error
        else {
          retried.add(claim.id)
          queue.push(claim)
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, claims.length) }, work))
  if (failure) throw failure

  // Every quote behind a "supported" or "partly", in one Zetaris statement.
  const quoted = results.filter((r) => r.passage && r.quote)
  const zetaris = await checkQuotes(
    quoted.map((r) => ({
      qid: r.id,
      fileId: r.passage?.fileId as string,
      passageId: r.passage?.passageId as string,
      quote: r.quote as string,
      transcript: r.passage?.page == null,
    })),
  )
  tracer.log({
    agent: "verifier",
    step: "check-draft",
    action: "queried_zetaris",
    sqlHash: zetaris.sql ? sqlHash(zetaris.sql) : undefined,
    rowsReturned: zetaris.rows,
    latencyMs: zetaris.ms,
    detail: { checked: quoted.length, found: zetaris.found.size },
  })
  for (const r of quoted) {
    const verified = zetaris.found.has(r.id)
    const next: ClaimResult = verified
      ? { ...r, verified: true }
      : {
          ...r,
          verdict: "not-found",
          why: "Its quote couldn't be confirmed in the source.",
          verified: false,
        }
    Object.assign(r, next)
    emit({ type: "result", result: next })
  }
  const counts = { supported: 0, partly: 0, contradicted: 0, "not-found": 0 } as Record<
    Verdict,
    number
  >
  for (const r of results) counts[r.verdict]++
  emit({ type: "done", counts, sql: zetaris.sql, ms: Math.round(performance.now() - started) })
  await tracer.flush()
  return { results, counts, sql: zetaris.sql }
}

// ------------------------------------------------------------------ search citation (F22)

const Matches = z.object({
  matches: z.array(
    z.object({
      passage: z.string().describe("The passage label, like p3"),
      support: z.enum(["supported", "partly"]),
      quote: z
        .string()
        .describe("5-30 consecutive words copied exactly from that passage that support the text"),
    }),
  ),
})

export type CitationMatch = FoundPassage & {
  support: "supported" | "partly"
  quote: string
  verified: boolean
}

/**
 * Search citation (plan F22): passages in the library's sources that support the selected text,
 * each with the exact words to cite, checked in code and in Zetaris before they're offered.
 */
export async function findCitations(ownerId: string, text: string, tracer: Tracer) {
  const { candidates } = await hybridSearch(ownerId, [text], {}, 8, { excludeNotes: true })
  if (!candidates.length) return []
  const labelled = candidates.map((c, i) => ({ label: `p${i + 1}`, c }))
  const { result, choice } = await call("writer", tracer, "cite", (c) =>
    generateText({
      model: model(c),
      providerOptions: reasoning(c),
      output: Output.object({ schema: Matches }),
      instructions:
        "Find the passages that support the text (fully, or part of it). For each, copy the words that support it exactly. Leave out passages that don't support it.",
      prompt: `Text: ${clean(text)}\n\nPassages:\n${labelled
        .map((l) => `[${l.label}] (${l.c.title})\n${clean(l.c.text)}`)
        .join("\n\n")}`,
    }),
  )
  const offered = result.output.matches.flatMap((m, i) => {
    const hit = labelled.find((l) => l.label === m.passage.trim())?.c
    if (!hit || quoteKey(m.quote).length < 10 || !quoteKey(hit.text).includes(quoteKey(m.quote)))
      return []
    return [{ qid: `m${i}`, hit, support: m.support, quote: m.quote.trim() }]
  })
  const zetaris = await checkQuotes(
    offered.map((o) => ({
      qid: o.qid,
      fileId: o.hit.fileId,
      passageId: o.hit.id,
      quote: o.quote,
      transcript: o.hit.page == null,
    })),
  )
  tracer.log({
    agent: "retriever",
    step: "cite",
    action: "searched_citations",
    model: choice.id,
    rowsReturned: offered.length,
    sqlHash: zetaris.sql ? sqlHash(zetaris.sql) : undefined,
    detail: { verified: zetaris.found.size },
  })
  await tracer.flush()
  return offered
    .filter((o) => zetaris.found.has(o.qid))
    .map(
      (o): CitationMatch => ({
        ...passageOf(o.hit),
        support: o.support,
        quote: o.quote,
        verified: true,
      }),
    )
    .sort((a, b) => Number(b.support === "supported") - Number(a.support === "supported"))
}

import { generateText, Output } from "ai"
import { z } from "zod"
import { quoteKey } from "./citations"
import { MODELS, type ModelChoice, model, noFallback, ordered, reasoning } from "./models"
import { hybridSearch, type Scope } from "./retrieve"
import type { Tracer } from "./trace"

/**
 * Where a newly found paper stands against what the person already has (a watch's finding, plan
 * F34): it agrees with one of their sources, disagrees with one, or covers something new to them.
 * The comparison quotes their passage, checked word for word in code; the new paper's side is its
 * abstract, which the card says.
 */
export type FindingStance =
  | {
      stance: "agrees" | "disagrees"
      /** The point compared, in at most 16 words. */
      claim: string
      fileId: string
      title: string
      kind: string
      passageId: string
      page: number | null
      /** Copied from the person's passage; found in it in code before it's shown. */
      quote: string
    }
  | { stance: "new"; claim: string }

/**
 * Below this best match, nothing the person has is about the paper's subject. Measured testing
 * (Nemotron Embed): abstracts on the library's subject 0.60–0.66, off-subject ones 0.20–0.26.
 */
const RELATED_SIMILARITY = 0.4
/** Passages compared with each finding. */
const PASSAGES = 6
/** Each comparison's own deadline: a slow one leaves the finding without a stance, never late. */
const BUDGET_MS = 20_000

const StanceSchema = z.object({
  stance: z.enum(["agrees", "disagrees", "new"]),
  claim: z
    .string()
    .describe("The one point compared, stated neutrally, at most 16 words (for new: its topic)"),
  passage: z
    .string()
    .describe("The passage label (like p2) it agrees or disagrees with; empty for new"),
  quote: z
    .string()
    .describe(
      "3-14 consecutive words copied exactly from that passage that show it; empty for new",
    ),
})

const INSTRUCTIONS = `You compare a newly published paper with passages from the user's own sources.
Decide one thing: does the new paper's abstract AGREE with a specific finding in one passage, DISAGREE with one (a conflicting result, value or conclusion), or is it NEW (the passages don't address its main point)?
Only say agrees or disagrees when one passage takes a clear position on the same point. Prefer disagrees when there is a real conflict. Quote 3-14 consecutive words copied exactly from that passage. Use only what the abstract and passages say.`

export async function placeFinding(
  ownerId: string,
  scope: Scope,
  paper: { title: string; abstract: string },
  tracer: Tracer,
): Promise<FindingStance | null> {
  const started = performance.now()
  const found = await hybridSearch(
    ownerId,
    [paper.title, paper.abstract.slice(0, 400)],
    scope,
    PASSAGES,
  )
  const best = Math.max(0, ...found.candidates.map((c) => c.similarity))
  if (!found.candidates.length || best < RELATED_SIMILARITY) {
    tracer.log({
      agent: "analyst",
      step: "stance",
      action: "new_to_library",
      detail: { title: paper.title, bestSimilarity: Number(best.toFixed(3)) },
    })
    return { stance: "new", claim: "Nothing in your sources covers this yet." }
  }
  const passages = found.candidates.map((c, i) => ({ ...c, label: `p${i + 1}` }))
  const call = (c: ModelChoice) =>
    generateText({
      model: model(c),
      providerOptions: reasoning(c),
      output: Output.object({ schema: StanceSchema }),
      instructions: INSTRUCTIONS,
      prompt: `New paper: ${paper.title}\nAbstract: ${paper.abstract.slice(0, 2000)}\n\nPassages from the user's sources:\n${passages
        .map((p) => `[${p.label}] (${p.title})\n${p.text}`)
        .join("\n\n")}`,
      abortSignal: AbortSignal.timeout(BUDGET_MS),
    })
  const pair = ordered(MODELS.analyst)
  let choice: ModelChoice = pair.primary
  let result: Awaited<ReturnType<typeof call>>
  try {
    result = await call(choice)
  } catch (error) {
    if (noFallback(error)) throw error
    choice = pair.fallback
    result = await call(choice)
  }
  const out = result.output
  const passage = passages.find((p) => p.label === out.passage.trim().replace(/^\[|\]$/g, ""))
  // The quote must be the person's own words from that passage; otherwise no stance is claimed.
  const held =
    out.stance !== "new" &&
    passage &&
    quoteKey(out.quote) &&
    quoteKey(passage.text).includes(quoteKey(out.quote))
  tracer.log({
    agent: "analyst",
    step: "stance",
    action: held ? `finding_${out.stance}` : "finding_new",
    model: choice.id,
    latencyMs: Math.round(performance.now() - started),
    tokens: { input: result.usage.inputTokens, output: result.usage.outputTokens },
    verdict: out.stance !== "new" && !held ? "quote_not_in_passage" : undefined,
    detail: { title: paper.title, claim: out.claim, passage: out.passage },
  })
  if (!held || !passage || out.stance === "new")
    return { stance: "new", claim: out.claim.trim() || "Nothing in your sources covers this yet." }
  return {
    stance: out.stance,
    claim: out.claim.trim(),
    fileId: passage.fileId,
    title: passage.title,
    kind: passage.kind,
    passageId: passage.id,
    page: passage.page,
    quote: out.quote.trim(),
  }
}

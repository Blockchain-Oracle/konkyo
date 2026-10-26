import { access, rename, rm } from "node:fs/promises"
import path from "node:path"
import { type Provenance, WorldModel } from "@konkyo/meterless/world-model"
import { checkQuotes, sqlHash } from "@konkyo/zetaris"
import { generateText, Output } from "ai"
import { z } from "zod"
import type { AnswerInput, SourceRef } from "./answer"
import { quoteKey } from "./citations"
import { freshCache } from "./fresh"
import { MODELS, type ModelChoice, model, noFallback, reasoning } from "./models"

/** A source's position on a claim (plan §7.4 #4): the stance glyph and its one word. */
export type Stance = "agrees" | "disagrees" | "partly"

export type MatrixCell = {
  fileId: string
  passageId: string
  stance: Stance
  /** Copied from the passage; checked in code, then in Zetaris. */
  quote: string
  page: number | null
  tStart: number | null
  /** Passages from this source taking this stance. */
  cites: number
  state: "checking" | "verified"
}

export type MatrixSource = { fileId: string; title: string; byline?: string; kind: string }

/** Claims × sources with stance (plan F13): where the library agrees and where it disagrees. */
export type Matrix = {
  state: "checking" | "done"
  claims: { id: string; text: string; cells: MatrixCell[] }[]
  sources: MatrixSource[]
  counts: { claims: number; sources: number; agree: number; disagree: number; partly: number }
}

export type Analysis = {
  matrix: Matrix
  sql: string
  model: string
  /** Absent for a public folder's visitor: their questions don't write to the owner's model. */
  worldModel?: { namespace: string; claims: number; relations: number }
}

const AnalystSchema = z.object({
  claims: z
    .array(
      z.object({
        claim: z.string().describe("One point, stated neutrally, at most 16 words"),
        stances: z
          .array(
            z.object({
              passage: z.string().describe("The passage label, like p3"),
              stance: z.enum(["agrees", "disagrees", "partly"]),
              quote: z
                .string()
                .describe(
                  "3-12 consecutive words copied exactly from that passage that show its stance",
                ),
            }),
          )
          .min(2)
          .max(8)
          .describe(
            "Every passage that takes a position on this claim: at least two, from different sources (different titles)",
          ),
      }),
    )
    .max(6),
})

/**
 * How long each Analyst model gets. A comparison is ~4k tokens in and ~900 out; models have a
 * slow tail (88 s and 127 s for the same work on 17 and testing; the free tier stalls for minutes
 * now and then), and the receipt waits for the comparison. Past its budget the fast fallback takes over;
 * past that, the answer lands without a comparison (the step shows failed).
 */
const ANALYST_BUDGET_MS = { primary: 25_000, fallback: 20_000 }

const ANALYST_INSTRUCTIONS = `You are the Analyst in a research assistant. You compare what the user's sources say about the question.
List 3-6 SPECIFIC claims (one finding, number, mechanism or condition each; never one broad summary) that two or more DIFFERENT sources (different titles) take a position on. Include the main points they agree on and every point where they differ or one qualifies another.
For each passage that addresses a claim: "agrees" if it states the claim, "disagrees" if it states the opposite or a conflicting value, "partly" if it supports it only with a limit or condition. Skip passages that don't address it.
Use only what the passages say. Each quote is 3-12 consecutive words copied exactly from that passage, nothing added. If the sources share no points, return no claims.`

/** One World Model per person (plan §2 Memory), on its own event-sourced file. */
const WORLD_DIR =
  process.env.KONKYO_WORLD_DIR ??
  path.resolve(process.env.KONKYO_ROOT ?? process.cwd(), ".data", "world")
const cachedWorld = freshCache<WorldModel>("__konkyoWorld")

/**
 * Whose World Model: a person's (`owner-<id>`), or a space's (`space-<id>`, plan §16.9) that grows
 * from everyone's asks in it. Each is rebuilt when another process (web, worker) changed its file.
 */
export type WorldKey = { owner: string } | { space: string }
const clean = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, "")
const namespaceOf = (key: WorldKey) =>
  "space" in key ? `space-${clean(key.space)}` : `owner-${clean(key.owner)}`
const worldFile = (key: WorldKey) => path.join(WORLD_DIR, ".world", `${namespaceOf(key)}.json`)

function worldFor(key: WorldKey) {
  const namespace = namespaceOf(key)
  const world = cachedWorld(
    namespace,
    worldFile(key),
    () => new WorldModel({ namespace, storage: "local", directory: WORLD_DIR }),
  )
  return { world, namespace }
}

/** One claim the World Model holds, with where each source stands on it (plan F51). */
export type KnownClaim = {
  id: string
  text: string
  at: string
  cells: {
    fileId: string
    title: string
    stance: Stance
    quote: string
    passageId: string
    page: number | null
  }[]
}

const STANCE_OF: Record<string, Stance> = {
  supports: "agrees",
  contradicts: "disagrees",
  qualifies: "partly",
}

type ShapeEntity = {
  id: string
  type: string
  name?: string
  attrs: Record<string, unknown>
  createdAt: string
}
type ShapeRelation = {
  from: string
  to: string
  type: string
  validTo?: string
  createdAt: string
  attrs?: Record<string, unknown>
}

/**
 * What a person's World Model holds (the knows page, plan F51): every claim two or more sources
 * take a position on, each source's stance with the quote it was read from, newest first. Read
 * from the rows the Analyst wrote, never a model. `fileIds` keeps only those sources (a space's).
 */
export function knowsOf(key: WorldKey, fileIds?: ReadonlySet<string>): KnownClaim[] {
  const { world } = worldFor(key)
  const shape = world.stateShape() as { entities: ShapeEntity[]; relationships: ShapeRelation[] }
  const entities = new Map(shape.entities.map((e) => [e.id, e]))
  const claims = new Map<string, KnownClaim>()
  for (const rel of shape.relationships) {
    const stance = STANCE_OF[rel.type]
    if (!stance || rel.validTo) continue
    const source = entities.get(rel.from)
    const claim = entities.get(rel.to)
    if (source?.type !== "source" || claim?.type !== "claim") continue
    const fileId = source.id.replace(/^source:konkyo:/, "")
    if (fileIds && !fileIds.has(fileId)) continue
    const known = claims.get(claim.id) ?? {
      id: claim.id,
      text: String(claim.attrs.text ?? claim.name ?? ""),
      at: claim.createdAt,
      cells: [],
    }
    if (rel.createdAt > known.at) known.at = rel.createdAt
    if (!known.cells.some((c) => c.fileId === fileId))
      known.cells.push({
        fileId,
        title: String(source.attrs.title ?? source.name ?? "A source"),
        stance,
        quote: String(rel.attrs?.quote ?? ""),
        passageId: String(rel.attrs?.passageId ?? ""),
        page: typeof rel.attrs?.page === "number" ? rel.attrs.page : null,
      })
    claims.set(claim.id, known)
  }
  return [...claims.values()]
    .filter((c) => c.cells.length >= 2 && c.text)
    .sort((a, b) => b.at.localeCompare(a.at))
}

/** Deletes a person's World Model file (account deletion). */
export async function deleteWorldOf(ownerId: string) {
  await rm(worldFile({ owner: ownerId }), { force: true })
}

/** Deletes a space's World Model file (the space is gone for good). */
export async function deleteSpaceWorld(spaceId: string) {
  await rm(worldFile({ space: spaceId }), { force: true })
}

/**
 * A guest's World Model goes with them when they sign in with Google (F43). Its file names its
 * owner only in the filename, so moving is a rename; an account that already has one keeps its own.
 */
export async function moveWorld(fromOwnerId: string, toOwnerId: string) {
  const from = worldFile({ owner: fromOwnerId })
  const to = worldFile({ owner: toOwnerId })
  const taken = await access(to).then(
    () => true,
    () => false,
  )
  if (taken) await rm(from, { force: true })
  else await rename(from, to).catch(() => undefined)
}

function countsOf(claims: Matrix["claims"], sources: MatrixSource[]): Matrix["counts"] {
  const cells = claims.flatMap((c) => c.cells)
  return {
    claims: claims.length,
    sources: sources.length,
    agree: cells.filter((c) => c.stance === "agrees").length,
    disagree: cells.filter((c) => c.stance === "disagrees").length,
    partly: cells.filter((c) => c.stance === "partly").length,
  }
}

/** Claims two or more sources still speak to, and the sources those cells come from. */
function shape(claims: Matrix["claims"], all: SourceRef[], state: Matrix["state"]): Matrix {
  const kept = claims
    .map((c) => ({ ...c, cells: c.cells }))
    .filter((c) => new Set(c.cells.map((cell) => cell.fileId)).size >= 2)
  const order: string[] = []
  for (const c of kept)
    for (const cell of c.cells) if (!order.includes(cell.fileId)) order.push(cell.fileId)
  const sources = order.map((fileId) => {
    const s = all.find((x) => x.fileId === fileId) as SourceRef
    return { fileId, title: s.title, byline: s.byline, kind: s.kind }
  })
  return { state, claims: kept, sources, counts: countsOf(kept, sources) }
}

/**
 * The Analyst (plan §2, F13): reads the retrieved passages alongside the Writer, extracts the
 * claims several sources take a position on, and keeps a cell only when its quote is in its
 * passage (code) and in Zetaris's own reading of the document (one statement). Claims, sources
 * and stances go into the person's Meterless World Model with provenance.
 */
export async function analyse(
  input: AnswerInput,
  question: string,
  sources: SourceRef[],
  onMatrix: (matrix: Matrix) => void,
): Promise<Analysis | null> {
  const { tracer } = input
  const started = performance.now()
  const call = (c: ModelChoice, budgetMs: number) =>
    generateText({
      model: model(c),
      providerOptions: reasoning(c),
      output: Output.object({ schema: AnalystSchema }),
      instructions: ANALYST_INSTRUCTIONS,
      prompt: `Passages:\n${sources
        .map((s) => `[${s.label}] (${s.title})\n${s.text}`)
        .join("\n\n")}\n\nQuestion: ${question}`,
      // A stopped run aborts it; so does its time budget (a TimeoutError, which falls back).
      abortSignal: AbortSignal.any([
        AbortSignal.timeout(budgetMs),
        ...(input.abortSignal ? [input.abortSignal] : []),
      ]),
    })
  let choice: ModelChoice = MODELS.analyst.primary
  let result: Awaited<ReturnType<typeof call>>
  try {
    result = await call(choice, ANALYST_BUDGET_MS.primary)
  } catch (error) {
    if (noFallback(error)) throw error
    choice = MODELS.analyst.fallback
    tracer.log({
      agent: "analyst",
      step: "claims",
      action: "escalated_to_fallback",
      model: choice.id,
      detail: { reason: (error as Error).message.slice(0, 300) },
    })
    result = await call(choice, ANALYST_BUDGET_MS.fallback)
  }

  // Code check: a cell stays only if its quote is in the passage it names.
  const byLabel = new Map(sources.map((s) => [s.label, s]))
  let dropped = 0
  const claims: Matrix["claims"] = result.output.claims.map((c, i) => {
    const cells = new Map<string, MatrixCell>()
    for (const s of c.stances) {
      const source = byLabel.get(s.passage.trim().replace(/^\[|\]$/g, ""))
      if (!source || !quoteKey(source.text).includes(quoteKey(s.quote)) || !quoteKey(s.quote)) {
        dropped++
        continue
      }
      const existing = cells.get(source.fileId)
      if (existing) {
        if (existing.stance === s.stance) existing.cites++
        continue
      }
      cells.set(source.fileId, {
        fileId: source.fileId,
        passageId: source.passageId,
        stance: s.stance,
        quote: s.quote.trim(),
        page: source.page,
        tStart: source.tStart,
        cites: 1,
        state: "checking",
      })
    }
    return { id: `claim-${i}`, text: c.claim.trim(), cells: [...cells.values()] }
  })
  tracer.log({
    agent: "analyst",
    step: "claims",
    action: "extracted_claims",
    model: choice.id,
    latencyMs: Math.round(performance.now() - started),
    tokens: { input: result.usage.inputTokens, output: result.usage.outputTokens },
    rowsReturned: claims.length,
    detail: {
      droppedByCode: dropped,
      // a claim only one source speaks to isn't a comparison: it never reaches the matrix
      singleSource: claims.filter((c) => new Set(c.cells.map((x) => x.fileId)).size < 2).length,
    },
  })
  const checking = shape(claims, sources, "checking")
  if (!checking.claims.length) return null
  onMatrix(checking)

  // Zetaris check: every cell's quote in one statement, like the Verifier's.
  const cells = checking.claims.flatMap((c, ci) =>
    c.cells.map((cell, k) => ({ qid: `m${ci}_${k}`, cell, claim: c })),
  )
  const zetaris = await checkQuotes(
    cells.map(({ qid, cell }) => ({
      qid,
      fileId: cell.fileId,
      passageId: cell.passageId,
      quote: cell.quote,
      transcript: cell.page == null,
    })),
  )
  tracer.log({
    agent: "analyst",
    step: "claims",
    action: "queried_zetaris",
    sqlHash: sqlHash(zetaris.sql),
    rowsReturned: zetaris.rows,
    latencyMs: zetaris.ms,
    detail: { checked: cells.length, found: zetaris.found.size },
  })
  const verified = checking.claims.map((c, ci) => ({
    ...c,
    cells: c.cells
      .filter((_cell, k) => zetaris.found.has(`m${ci}_${k}`))
      .map((cell) => ({ ...cell, state: "verified" as const })),
  }))
  const matrix = shape(verified, sources, "done")

  // Your World Model always; a space's too when the ask covered exactly one space (its members
  // see what everyone's asks found there).
  const worldModel = input.visitor
    ? undefined
    : await recordInWorld(input, question, matrix, { owner: input.ownerId })
  if (!input.visitor && input.spaceId)
    await recordInWorld(input, question, matrix, { space: input.spaceId }).catch(() => undefined)
  onMatrix(matrix)
  return {
    matrix,
    sql: zetaris.sql,
    model: choice.id,
    worldModel,
  }
}

/** The World Model keeps every source's stance on every claim, with where it was read. */
async function recordInWorld(input: AnswerInput, question: string, matrix: Matrix, key: WorldKey) {
  const { tracer } = input
  const { world, namespace } = worldFor(key)
  const at = new Date()
  const by = (passageId?: string): Provenance => ({
    kind: "agent",
    by: "analyst",
    at,
    runId: tracer.runId,
    ...(passageId ? { url: `konkyo:passage:${passageId}` } : {}),
  })
  const context = await world.upsertContext({
    type: "run",
    externalKey: { system: "konkyo", id: tracer.runId },
    attrs: { question },
    source: by(),
  })
  const sourceIds = new Map<string, string>()
  for (const s of matrix.sources) {
    const entity = await world.upsertEntity({
      type: "source",
      externalKey: { system: "konkyo", id: s.fileId },
      name: s.title,
      attrs: { title: s.title, byline: s.byline },
      source: by(),
    })
    sourceIds.set(s.fileId, entity.id)
  }
  let relations = 0
  for (const claim of matrix.claims) {
    const entity = await world.upsertEntity({
      type: "claim",
      name: claim.text,
      attrs: { text: claim.text },
      source: by(),
    })
    claim.id = entity.id
    for (const cell of claim.cells) {
      await world.relate({
        from: sourceIds.get(cell.fileId) as string,
        type:
          cell.stance === "agrees"
            ? "supports"
            : cell.stance === "disagrees"
              ? "contradicts"
              : "qualifies",
        to: entity.id,
        context: context.id,
        attrs: { quote: cell.quote, passageId: cell.passageId, page: cell.page },
        source: by(cell.passageId),
      })
      relations++
    }
  }
  tracer.log({
    agent: "analyst",
    step: "world-model",
    action: "asserted_world_model",
    rowsReturned: relations,
    detail: { namespace, claims: matrix.claims.length, sources: matrix.sources.length },
  })
  return { namespace, claims: matrix.claims.length, relations }
}

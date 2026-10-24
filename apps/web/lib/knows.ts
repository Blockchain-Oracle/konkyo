import "server-only"
import { type KnownClaim, knowsOf, listMemories, type MemoryItem } from "@konkyo/agents"
import { SPACES, type SpaceColor } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { spaceRole } from "@konkyo/db/access"
import { eq, type SQL, sql } from "drizzle-orm"
import { LibraryError } from "./library"
import { todaySummary } from "./study"

/** A claim, each source with its kind so its chip can open the passage. */
export type KnowsClaim = Omit<KnownClaim, "cells"> & {
  cells: (KnownClaim["cells"][number] & { kind: string })[]
}

export type Knows = {
  /** The whole library, or one space. */
  scope: { spaceId: string | null; name: string; hex: string; sources: number }
  claims: KnowsClaim[]
  told: MemoryItem[]
  words: { word: string; files: number }[]
  coming: {
    due: number
    files: number
    next: { at: string; count: number } | null
    agents: { id: string; name: string; at: string }[]
  }
  made: {
    kind: "practice" | "brief" | "deep"
    id: string
    title: string
    at: string
    href: string
  }[]
  heldBack: {
    answers: number
    quotes: number
    rewritten: number
    dropped: number
    examples: { question: string; reasons: string[]; chatId: string }[]
  }
}

const MAX_CLAIMS = 12
const MAX_WORDS = 10
const WEEK_MS = 7 * 86_400_000
const MONTH_MS = 30 * 86_400_000

/** Paper boilerplate that every source repeats; not what your sources are about. */
const BOILERPLATE = new Set(
  "also across however although figure figures table tables using used study studies result results show shown shows within among well found based data journal article review http https doi license copyright author authors abstract introduction conclusion methods method".split(
    " ",
  ),
)

/**
 * What Konkyo knows (plan F51, OurSpaces' "what this space knows"): built from rows, never a
 * model. Where your sources agree and disagree (the World Model the Analyst writes), what you
 * told it (H-MEM), the words your sources share, what's coming up, what it made for you, and
 * what it held back this week (quotes the Verifier sent back or dropped, with the reasons).
 */
export async function knows(ownerId: string, spaceId: string | null): Promise<Knows> {
  let name = "your library"
  let hex: string = SPACES.colors.violet.hex
  if (spaceId) {
    if (!(await spaceRole(ownerId, spaceId))) throw new LibraryError("No such space", 404)
    const space = await db.query.folders.findFirst({ where: eq(schema.folders.id, spaceId) })
    if (!space) throw new LibraryError("No such space", 404)
    name = space.name
    hex = SPACES.colors[(space.color ?? "violet") as SpaceColor]?.hex ?? hex
  }

  // The sources in scope: a space's files (anywhere inside it, whoever added them), or the
  // whole library (mine).
  const inScope = spaceId
    ? sql`select f.id, f.kind from files f
          join file_folders ff on ff.file_id = f.id
          join folders d on d.id = ff.folder_id and d.deleted_at is null
          where d.space_id = ${spaceId}
            and f.deleted_at is null and f.status = 'ready'`
    : sql`select id, kind from files where owner_id = ${ownerId}
            and deleted_at is null and status = 'ready'`
  const fileRows = await db.execute<{ id: string; kind: string }>(
    sql`select distinct id, kind from (${inScope}) s`,
  )
  const fileIds = fileRows.map((r) => r.id)
  // Sources since deleted or still being read drop out of every claim.
  const kinds = new Map(fileRows.map((r) => [r.id, r.kind]))

  const [words, today, agents, made, held] = await Promise.all([
    fileIds.length ? sharedWords(sql`select id from (${inScope}) s`) : Promise.resolve([]),
    todaySummary(ownerId),
    db.execute<{ id: string; name: string; at: string }>(sql`
      select id, name, next_run_at as at from agents
      where owner_id = ${ownerId} and status = 'active' and next_run_at is not null
      order by next_run_at limit 3`),
    madeFor(ownerId, spaceId),
    heldBack(ownerId, spaceId),
  ])

  return {
    scope: { spaceId, name, hex, sources: fileIds.length },
    claims: knowsOf(ownerId, new Set(kinds.keys()))
      .slice(0, MAX_CLAIMS)
      .map((c) => ({
        ...c,
        cells: c.cells.map((cell) => ({ ...cell, kind: kinds.get(cell.fileId) ?? "pdf" })),
      })),
    told: listMemories(ownerId).slice(0, 12),
    words,
    coming: {
      due: today.due,
      files: today.files,
      next: today.next,
      agents: agents.map((a) => ({ ...a, at: new Date(a.at).toISOString() })),
    },
    made,
    heldBack: held,
  }
}

/**
 * The words your sources use a lot: the most frequent real words (not stems) found in two or
 * more of the sources, English stopwords and paper boilerplate left out.
 */
async function sharedWords(inScope: SQL) {
  const rows = await db.execute<{ word: string; files: number; uses: number }>(sql`
    with counted as (
      select w.word, count(distinct p.file_id)::int as files, count(*)::int as uses
      from passages p,
        lateral unnest(tsvector_to_array(to_tsvector('simple', p.text))) as w(word)
      where p.file_id in (${inScope})
        and length(w.word) between 4 and 24 and w.word !~ '[0-9_./:@-]'
      group by w.word
      having count(distinct p.file_id) >= 2
      order by count(*) desc
      limit 200
    )
    select word, files, uses from counted
    where to_tsvector('english', word) <> ''::tsvector
    order by uses desc
  `)
  // One word per idea: "models" folds into "model" when both are there.
  const seen = new Set(rows.map((r) => r.word))
  return rows
    .filter((r) => !BOILERPLATE.has(r.word))
    .filter((r) => !(r.word.endsWith("s") && seen.has(r.word.slice(0, -1))))
    .slice(0, MAX_WORDS)
    .map(({ word, files }) => ({ word, files }))
}

/** What Konkyo made for you this month: practice sets, audio briefs, deep searches. */
async function madeFor(ownerId: string, spaceId: string | null): Promise<Knows["made"]> {
  const since = new Date(Date.now() - MONTH_MS).toISOString()
  const inSpace = (scope: string) =>
    spaceId ? sql`and ${sql.raw(scope)} -> 'folderIds' ? ${spaceId}` : sql``
  const [sets, briefs, deeps] = await Promise.all([
    db.execute<{ id: string; title: string; at: Date }>(sql`
      select id, title, created_at as at from study_sets
      where owner_id = ${ownerId} and status = 'ready' and created_at > ${since} ${inSpace("scope")}
      order by created_at desc limit 4`),
    db.execute<{ id: string; title: string; at: Date }>(sql`
      select id, title, created_at as at from briefs
      where owner_id = ${ownerId} and status = 'ready' and created_at > ${since}
        ${spaceId ? sql`and folder_id = ${spaceId}` : sql``}
      order by created_at desc limit 4`),
    spaceId
      ? Promise.resolve([] as { id: string; title: string; at: Date; chat: string }[])
      : db.execute<{ id: string; title: string; at: Date; chat: string }>(sql`
          select id, question as title, finished_at as at, chat_id as chat from runs
          where owner_id = ${ownerId} and kind = 'deep' and status = 'answered'
            and finished_at > ${since}
          order by finished_at desc limit 3`),
  ])
  return [
    ...sets.map((s) => ({
      kind: "practice" as const,
      id: s.id,
      title: s.title,
      at: new Date(s.at).toISOString(),
      href: `/study/session?mode=quiz&set=${s.id}`,
    })),
    ...briefs.map((b) => ({
      kind: "brief" as const,
      id: b.id,
      title: b.title,
      at: new Date(b.at).toISOString(),
      href: `/briefs/${b.id}`,
    })),
    ...deeps.map((d) => ({
      kind: "deep" as const,
      id: d.id,
      title: d.title,
      at: new Date(d.at).toISOString(),
      href: `/chats/${d.chat}`,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 6)
}

/**
 * What it held back this week: how many answers it checked, how many quotes the Verifier sent
 * back to be rewritten or dropped, and the reasons it gave (the answers' "revising" parts).
 */
async function heldBack(ownerId: string, spaceId: string | null): Promise<Knows["heldBack"]> {
  const since = new Date(Date.now() - WEEK_MS).toISOString()
  const rows = await db.execute<{ parts: unknown[]; question: string | null; chat: string }>(sql`
    select m.parts, r.question, m.chat_id as chat from messages m
    join chats c on c.id = m.chat_id
    left join runs r on r.id = m.run_id
    where m.owner_id = ${ownerId} and m.role = 'assistant' and m.created_at > ${since}
      ${spaceId ? sql`and c.scope -> 'folderIds' ? ${spaceId}` : sql``}
    order by m.created_at desc limit 200`)
  const out: Knows["heldBack"] = { answers: 0, quotes: 0, rewritten: 0, dropped: 0, examples: [] }
  for (const row of rows) {
    const parts = row.parts as { type: string; data?: Record<string, unknown> }[]
    const receipt = parts.find((p) => p.type === "data-receipt")?.data as
      | { quotes: number; rewritten: number; dropped: number }
      | undefined
    if (!receipt) continue
    out.answers++
    out.quotes += receipt.quotes
    out.rewritten += receipt.rewritten
    out.dropped += receipt.dropped
    const reasons = parts
      .filter((p) => p.type === "data-revising")
      .flatMap((p) => (p.data?.reasons as string[] | undefined) ?? [])
    if (reasons.length && out.examples.length < 3 && row.question)
      out.examples.push({ question: row.question, reasons: reasons.slice(0, 2), chatId: row.chat })
  }
  return out
}

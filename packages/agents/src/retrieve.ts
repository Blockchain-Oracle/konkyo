import { createHash } from "node:crypto"
import { db, schema } from "@konkyo/db"
import { taped } from "@konkyo/tape"
import { embedMany } from "ai"
import { inArray, sql } from "drizzle-orm"
import { EMBEDDING_MODEL, openai } from "./models"

const { embeddingCache } = schema

/** What a chat looks at: everything (empty), or some files and folders (with their subfolders). */
export type Scope = { fileIds?: string[]; folderIds?: string[] }

export type Candidate = {
  id: string
  fileId: string
  title: string
  kind: string
  page: number | null
  tStart: number | null
  tEnd: number | null
  speaker: string | null
  text: string
  /** Fused rank score (higher is better). */
  score: number
  /** Best cosine similarity to any of the queries (0–1), for the "not in your library" call. */
  similarity: number
  /** "Xie, Liu and Hero · 2017" from the file's citation record, when it has one. */
  byline?: string
}

type Csl = {
  author?: { family?: string; literal?: string }[]
  issued?: { "date-parts"?: number[][] }
}

/** "Vaswani et al. · 2017": family names (three at most), then the year. */
export function bylineOf(meta: { csl?: Csl } | null): string | undefined {
  const csl = meta?.csl
  if (!csl) return undefined
  const names = (csl.author ?? []).map((a) => a.family ?? a.literal).filter(Boolean) as string[]
  const who =
    names.length > 3
      ? `${names[0]} et al.`
      : names.length > 1
        ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
        : names[0]
  const year = csl.issued?.["date-parts"]?.[0]?.[0]
  return [who, year].filter(Boolean).join(" · ") || undefined
}

/** The same key the ingest cache uses, so a question about a passage reuses its vector. */
const cacheKey = (text: string) =>
  createHash("sha256").update(`${EMBEDDING_MODEL}\n${text}`).digest("hex")

/** Query vectors from the cache, the missing ones in a single embedding request. */
export async function embedQueries(texts: string[]): Promise<number[][]> {
  const hashes = texts.map(cacheKey)
  const hits = await db
    .select({ hash: embeddingCache.hash, embedding: embeddingCache.embedding })
    .from(embeddingCache)
    .where(inArray(embeddingCache.hash, hashes))
  const cached = new Map(hits.map((h) => [h.hash, h.embedding]))
  const missing = texts.filter((_, i) => !cached.has(hashes[i] as string))
  if (missing.length) {
    const { embeddings } = await embedMany({
      model: openai.embedding(EMBEDDING_MODEL),
      values: missing,
    })
    const fresh = missing.map((text, i) => ({
      hash: cacheKey(text),
      embedding: embeddings[i] as number[],
    }))
    await db.insert(embeddingCache).values(fresh).onConflictDoNothing()
    for (const f of fresh) cached.set(f.hash, f.embedding)
  }
  return hashes.map((h) => cached.get(h) as number[])
}

/** The files a scope covers: chosen files plus everything filed in the chosen folders' subtrees. */
export async function scopeFileIds(ownerId: string, scope: Scope): Promise<string[] | null> {
  const fileIds = scope.fileIds ?? []
  const folderIds = scope.folderIds ?? []
  if (!fileIds.length && !folderIds.length) return null
  if (!folderIds.length) return fileIds
  const rows = await db.execute<{ file_id: string }>(sql`
    with recursive tree as (
      select id from folders where owner_id = ${ownerId} and deleted_at is null
        and id in (${sql.join(
          folderIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
      union all
      select f.id from folders f join tree t on f.parent_id = t.id where f.deleted_at is null
    )
    select distinct ff.file_id from file_folders ff join tree t on ff.folder_id = t.id
  `)
  return [...new Set([...fileIds, ...rows.map((r) => r.file_id)])]
}

/** Reciprocal Rank Fusion's constant: dampens the gap between rank 1 and rank 2 (Cormack et al.). */
const RRF_K = 60
const PER_LIST = 40

/**
 * Hybrid search over the person's passages (plan §2 Retriever): pgvector cosine and Postgres full
 * text for each query, fused by Reciprocal Rank Fusion. Only Ready, non-deleted files count.
 */
export const hybridSearch = taped(
  "library.search",
  searchLibrary,
  // The person's id isn't part of the key, so a recorded run replays for anyone.
  (_ownerId, queries, scope?, limit?, options?) => [queries, scope, limit, options],
)

async function searchLibrary(
  ownerId: string,
  queries: string[],
  scope: Scope = {},
  limit = 16,
  /** Check my draft and search citation look only at sources: a note never supports a note. */
  options: { excludeNotes?: boolean } = {},
): Promise<{ candidates: Candidate[]; scopedFiles: number | null }> {
  const files = await scopeFileIds(ownerId, scope)
  if (files && !files.length) return { candidates: [], scopedFiles: 0 }
  const notNotes = options.excludeNotes ? sql`and f.kind <> 'note'` : sql``
  const inScope = files
    ? sql`and p.file_id in (${sql.join(
        files.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`
    : sql``

  const vectors = await embedQueries(queries)
  const lists = await db.transaction(async (tx) => {
    // Filters run after the HNSW scan; iterative scans keep looking until enough rows pass them.
    await tx.execute(sql`set local hnsw.ef_search = 100`)
    await tx.execute(sql`set local hnsw.iterative_scan = relaxed_order`)
    const runs = []
    for (const [i, query] of queries.entries()) {
      const vector = `[${vectors[i]?.join(",")}]`
      runs.push(
        tx.execute<{ id: string; sim: number }>(sql`
          select p.id, 1 - (p.embedding <=> ${vector}::vector) as sim
          from passages p join files f on f.id = p.file_id
          where p.owner_id = ${ownerId} and f.deleted_at is null and f.status = 'ready' ${notNotes}
            and p.embedding is not null ${inScope}
          order by p.embedding <=> ${vector}::vector
          limit ${PER_LIST}
        `),
        tx.execute<{ id: string; sim: number }>(sql`
          select p.id, 0 as sim
          from passages p join files f on f.id = p.file_id,
            websearch_to_tsquery('english', ${query}) q
          where p.owner_id = ${ownerId} and f.deleted_at is null and f.status = 'ready' ${notNotes}
            and p.tsv @@ q ${inScope}
          order by ts_rank_cd(p.tsv, q) desc
          limit ${PER_LIST}
        `),
      )
    }
    return Promise.all(runs)
  })

  const fused = new Map<string, { score: number; similarity: number }>()
  for (const list of lists) {
    list.forEach((row, rank) => {
      const entry = fused.get(row.id) ?? { score: 0, similarity: 0 }
      entry.score += 1 / (RRF_K + rank + 1)
      entry.similarity = Math.max(entry.similarity, Number(row.sim))
      fused.set(row.id, entry)
    })
  }
  const top = [...fused.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, limit)
  if (!top.length) return { candidates: [], scopedFiles: files?.length ?? null }

  const rows = await db.execute<{
    id: string
    file_id: string
    title: string
    kind: string
    page: number | null
    t_start: number | null
    t_end: number | null
    speaker: string | null
    text: string
    meta: { csl?: Csl } | null
  }>(sql`
    select p.id, p.file_id, f.title, f.kind::text as kind, p.page, p.t_start, p.t_end, p.speaker, p.text, f.meta
    from passages p join files f on f.id = p.file_id
    where p.id in (${sql.join(
      top.map(([id]) => sql`${id}`),
      sql`, `,
    )})
  `)
  const byId = new Map(rows.map((r) => [r.id, r]))
  const candidates = top.flatMap(([id, { score, similarity }]) => {
    const r = byId.get(id)
    return r
      ? [
          {
            id,
            fileId: r.file_id,
            title: r.title,
            kind: r.kind,
            page: r.page,
            tStart: r.t_start,
            tEnd: r.t_end,
            speaker: r.speaker,
            text: r.text,
            score,
            similarity,
            byline: bylineOf(r.meta),
          },
        ]
      : []
  })
  return { candidates, scopedFiles: files?.length ?? null }
}

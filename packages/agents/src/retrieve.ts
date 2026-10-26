import { db, schema } from "@konkyo/db"
import { reachSql, resolveReach } from "@konkyo/db/access"
import { embed, embeddingKey } from "@konkyo/models"
import { taped } from "@konkyo/tape"
import { inArray, sql } from "drizzle-orm"

const { embeddingCache } = schema

/**
 * Reference lists, front matter and tables of numbers: nothing there to learn from or to quote as
 * a finding (a bibliography of spindle papers embeds close to a question about spindles).
 */
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

/** A query's own cache key: Nemotron embeds a question differently from a passage. */
const cacheKey = (text: string) => embeddingKey(text, "query")

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
    const { vectors } = await embed(missing, "query")
    const fresh = missing.map((text, i) => ({
      hash: cacheKey(text),
      embedding: vectors[i] as number[],
    }))
    await db.insert(embeddingCache).values(fresh).onConflictDoNothing()
    for (const f of fresh) cached.set(f.hash, f.embedding)
  }
  return hashes.map((h) => cached.get(h) as number[])
}

/**
 * The files a scope covers: chosen files plus everything filed in the chosen folders' subtrees,
 * including other people's files in a shared space you're a member of (`@konkyo/db/access`).
 * Null means the whole library.
 */
export async function scopeFileIds(ownerId: string, scope: Scope): Promise<string[] | null> {
  return (await resolveReach(ownerId, scope)).fileIds
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
  // Mine as always; in a shared space, exactly the files its members may read (access.ts).
  const reach = await resolveReach(ownerId, scope)
  const files = reach.fileIds
  if (files && !files.length) return { candidates: [], scopedFiles: 0 }
  const notNotes = options.excludeNotes ? sql`and f.kind <> 'note'` : sql``
  const inReach = reachSql(reach, "p")

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
          where ${inReach} and f.deleted_at is null and f.status = 'ready' ${notNotes}
            and p.embedding is not null
          order by p.embedding <=> ${vector}::vector
          limit ${PER_LIST}
        `),
        tx.execute<{ id: string; sim: number }>(sql`
          select p.id, 0 as sim
          from passages p join files f on f.id = p.file_id,
            websearch_to_tsquery('english', ${query}) q
          where ${inReach} and f.deleted_at is null and f.status = 'ready' ${notNotes}
            and p.tsv @@ q
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
  // Twice the passages are read, so reference lists can give way to prose (below).
  const top = [...fused.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, limit * 2)
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
  // Reference lists and front matter embed close to the questions they cite (a bibliography of
  // spindle papers scored 0.63 for "what do spindles do for memory?"), but they hold no findings:
  // the Writer once copied one title over and over (in testing). Prose comes first; they're kept only
  // when nothing else matched (a question about a paper's references).
  const prose = candidates.filter((c) => !looksLikeApparatus(c.text))
  return {
    candidates: (prose.length ? prose : candidates).slice(0, limit),
    scopedFiles: files?.length ?? null,
  }
}

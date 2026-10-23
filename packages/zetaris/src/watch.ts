import { ZETARIS } from "@konkyo/config"
import { env } from "@konkyo/env/server"
import { literal, run, ZetarisError } from "./client"

const DB = ZETARIS.database

/** A paper a watch found: enough to show it and import it. */
export type WatchedWork = {
  openalexId: string
  doi: string
  title: string
  publicationDate: string
  firstAuthor: string | null
  authors: number
  venue: string | null
}

const SELECT = "id,doi,display_name,publication_date,authorships,primary_location"

/**
 * The OpenAlex search a watch runs (plan F34): papers whose title or abstract match the topic
 * (plain `search=` also matches full text, which let loosely related papers through: checked
 * testing), newest first, open access with a PDF copy so Import can read it, trimmed with
 * `select=` (5–10× faster in Zetaris, S00). Commas would split OpenAlex's filter list.
 */
export const watchEndpoint = (topic: string) =>
  `https://api.openalex.org/works?filter=title_and_abstract.search:${encodeURIComponent(topic.replace(/,/g, " ").trim())},open_access.is_oa:true,has_content.pdf:true,type:article|preprint|review&sort=publication_date:desc&per_page=25&select=${SELECT}`

export const watchTableName = (agentId: string) =>
  `konkyo_watch_${agentId.replace(/-/g, "").slice(0, 16)}`

/**
 * One Lightning REST table per watch. The OpenAlex key goes in a header: in the URL it would
 * show to anyone listing the database's tables (S00). Re-created on edit (drop + create, 0.2 s).
 */
export async function createWatchTable(agentId: string, topic: string) {
  const table = watchTableName(agentId)
  await dropWatchTable(table)
  const key = env.OPENALEX_API_KEY
  const header = key ? `HEADER ("api-key" "${key.replace(/"/g, "")}")` : "HEADER ()"
  await run(
    `CREATE LIGHTNING REST TABLE ${table} FROM ${DB} REQUEST (endpoint "${watchEndpoint(topic)}", method "GET", response_type "JSON", http_encoding "URLENCODED", insecure_ssl "false") ${header} BODY ()`,
  )
  return table
}

export async function dropWatchTable(table: string) {
  await run(`DROP LIGHTNING DATABASE TABLE ${DB}.${table}`).catch(() => undefined)
}

/** A REST table's cache never refreshes by itself, and REFRESH does nothing: UNCACHE + CACHE. */
export async function refreshWatch(table: string) {
  await run(`UNCACHE TABLE ${DB}.${table}`).catch(() => undefined)
  await run(`CACHE TABLE ${DB}.${table}`, { timeoutMs: ZETARIS.queryTimeoutMs })
}

const works = (table: string, nested: boolean) => `
  SELECT r.id AS id,
    lower(regexp_replace(r.doi, '^https?://doi.org/', '')) AS doi,
    r.display_name AS title,
    r.publication_date AS publication_date
    ${nested ? ", r.authorships[0].author.display_name AS first_author, size(r.authorships) AS authors, r.primary_location.source.display_name AS venue" : ""}
  FROM ${DB}.${table} t LATERAL VIEW explode(t.results) e AS r
  WHERE r.doi IS NOT NULL AND r.publication_date <= current_date()`

/**
 * What's new in the watch: its papers minus every DOI the person already has or was told about,
 * in one statement (explode in a subquery first, then LEFT ANTI JOIN; S00: 0.8–1.0 s). If the
 * inferred schema lacks the nested author and venue fields, the plain columns still answer.
 */
export async function newWorks(table: string, known: string[]) {
  const values = (known.length ? known : ["__none__"])
    .map((doi) => `(${literal(doi.toLowerCase())})`)
    .join(", ")
  const statement = (nested: boolean) => `SELECT w.* FROM (${works(table, nested)}) w
LEFT ANTI JOIN (VALUES ${values}) AS k(doi) ON w.doi = k.doi
ORDER BY w.publication_date DESC`
  const started = performance.now()
  let sql = statement(true)
  let result: Awaited<ReturnType<typeof run>>
  try {
    result = await run(sql, { timeoutMs: ZETARIS.queryTimeoutMs })
  } catch (error) {
    if (!(error instanceof ZetarisError)) throw error
    sql = statement(false)
    result = await run(sql, { timeoutMs: ZETARIS.queryTimeoutMs })
  }
  const found: WatchedWork[] = result.rows.map((r) => ({
    openalexId: String(r.id ?? "").replace("https://openalex.org/", ""),
    doi: String(r.doi ?? ""),
    title: String(r.title ?? "Untitled"),
    publicationDate: String(r.publication_date ?? ""),
    firstAuthor: r.first_author ?? null,
    authors: Number(r.authors ?? 0),
    venue: r.venue ?? null,
  }))
  return {
    works: found,
    sql,
    ms: Math.round(performance.now() - started),
    rows: result.rows.length,
  }
}

import "server-only"
import { env } from "@konkyo/env/server"
import { type FoundWork, searchWorks } from "@konkyo/ingest/metadata"
import { checkQuotes } from "@konkyo/zetaris"
import { LibraryError } from "@/lib/library"
import { OPENALEX_TOPICS, ZETARIS_EXAMPLE } from "@/lib/made-with-examples"
import { openShare, visitorOf } from "@/lib/shares"

/**
 * The made-with pages' live examples: a real Zetaris check and a real OpenAlex search,
 * for anyone. Zetaris is the engine every answer's checks run on, so the example shares one
 * check at a time and keeps its result for half a minute; both are capped per visitor and per
 * server in memory (one web process serves konkyo.xyz; a restart only resets the windows).
 */
const WINDOW_MS = 60_000
const LIMITS = {
  zetaris: { visitor: 12, server: 30 },
  openalex: { visitor: 12, server: 120 },
} as const
type Example = keyof typeof LIMITS
const calls = new Map<string, number[]>()
/** Past this many keys, windows that have emptied are swept. */
const SWEEP_AT = 2_000

function recent(key: string, now: number) {
  return (calls.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
}

/** Whether this request may run a live example now; it's counted only if it may. */
export function liveAllowed(request: Request, example: Example) {
  const now = Date.now()
  if (calls.size > SWEEP_AT)
    for (const [key, times] of calls) if (!times.some((t) => now - t < WINDOW_MS)) calls.delete(key)
  // An unknown address (no proxy header, i.e. local) shares the server's window only.
  const known = request.headers.has("x-forwarded-for") || request.headers.has("x-real-ip")
  const keys = [
    [example, LIMITS[example].server] as const,
    ...(known ? [[`${example}:${visitorOf(request)}`, LIMITS[example].visitor] as const] : []),
  ]
  const windows = keys.map(([key, max]) => ({ key, max, times: recent(key, now) }))
  if (windows.some((w) => w.times.length >= w.max)) return false
  for (const w of windows) calls.set(w.key, [...w.times, now])
  return true
}

export type ExampleCheck = { found: string[]; ms: number; sql: string; checkedAt: number }

/** A check is shown to everyone who asks within this long, so Zetaris runs at most twice a minute. */
const CHECK_TTL_MS = 30_000
/** Well under an answer's 30 s: the example must never hold the engine for long. */
const CHECK_TIMEOUT_MS = 10_000
let check: { at: number; result: Promise<ExampleCheck> } | null = null

/** The last check, if it's fresh enough to show again. */
export function freshCheck() {
  return check && Date.now() - check.at < CHECK_TTL_MS ? check.result : null
}

async function runCheck(): Promise<ExampleCheck> {
  const slug = env.DEMO_SHARE_SLUG
  if (!slug) throw new LibraryError("The sample space isn't set up on this server", 503)
  const share = await openShare(slug)
  const paper = share.files.find((f) => f.title.startsWith(ZETARIS_EXAMPLE.paper))
  if (!paper) throw new LibraryError("The sample paper isn't in the sample space", 503)
  const result = await checkQuotes(
    ZETARIS_EXAMPLE.quotes.map((q) => ({
      qid: q.id,
      fileId: paper.id,
      passageId: "",
      quote: q.text,
      transcript: false,
    })),
    { timeoutMs: CHECK_TIMEOUT_MS },
  )
  // The first quote is the paper's own words: not finding it means Zetaris doesn't hold the
  // paper right now, not that the quotes are wrong.
  if (!result.found.has(ZETARIS_EXAMPLE.quotes[0].id))
    throw new LibraryError("Zetaris doesn't have the sample paper right now. Try again soon.", 503)
  return { found: [...result.found], ms: result.ms, sql: result.sql, checkedAt: Date.now() }
}

/** The three example quotes, checked in Zetaris in one statement; one check at a time. */
export function checkExample(): Promise<ExampleCheck> {
  const fresh = freshCheck()
  if (fresh) return fresh
  const result = runCheck()
  check = { at: Date.now(), result }
  // a failed check isn't kept
  result.catch(() => {
    if (check?.result === result) check = null
  })
  return result
}

export type ExampleWork = Pick<FoundWork, "id" | "title" | "year" | "venue" | "cited"> & {
  authors: string
  doi: string | null
}

/** Ten minutes is fresh enough for search results, and spares OpenAlex a click storm. */
const SEARCH_TTL_MS = 10 * 60_000
const searches = new Map<number, { at: number; works: Promise<ExampleWork[]> }>()

const authorsOf = (names: string[]) =>
  names.length <= 2 ? names.join(" and ") : `${names[0]} et al.`

/** A topic's search, if one is fresh (shown again without counting against any limit). */
export function freshSearch(topic: number) {
  const cached = searches.get(topic)
  return cached && Date.now() - cached.at < SEARCH_TTL_MS ? cached.works : null
}

/** The top open-access papers with a PDF copy for one of the example topics. */
export function searchExample(topic: number): Promise<ExampleWork[]> {
  const query = OPENALEX_TOPICS[topic]
  if (!query) throw new LibraryError("No such topic", 400)
  const fresh = freshSearch(topic)
  if (fresh) return fresh
  const works = searchWorks(query, 8).then((found) =>
    found.slice(0, 3).map((w) => ({
      id: w.id,
      title: w.title,
      year: w.year,
      venue: w.venue,
      cited: w.cited,
      doi: w.doi,
      authors: authorsOf(w.authors.map((a) => a.split(" ").at(-1) ?? a)),
    })),
  )
  searches.set(topic, { at: Date.now(), works })
  // a failed search isn't kept
  works.catch(() => {
    if (searches.get(topic)?.works === works) searches.delete(topic)
  })
  return works
}

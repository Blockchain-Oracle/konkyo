import "server-only"
import { env } from "@konkyo/env/server"
import { type FoundWork, searchWorks } from "@konkyo/ingest/metadata"
import { checkQuotes } from "@konkyo/zetaris"
import { LibraryError } from "@/lib/library"
import { OPENALEX_TOPICS, ZETARIS_EXAMPLE } from "@/lib/made-with-examples"
import { openShare, visitorOf } from "@/lib/shares"

/**
 * The made-with pages' live examples (plan F61): a real Zetaris check and a real OpenAlex search,
 * for anyone, so each is capped per visitor and per server in memory. One web process serves
 * konkyo.xyz; a restart only resets the windows.
 */
const PER_VISITOR = 12
const PER_SERVER = 240
const WINDOW_MS = 60_000
const calls = new Map<string, number[]>()

/** Whether this request may run a live example now. */
export function liveAllowed(request: Request, example: string) {
  const now = Date.now()
  const take = (key: string, max: number) => {
    const recent = (calls.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
    if (recent.length >= max) return false
    recent.push(now)
    calls.set(key, recent)
    return true
  }
  // An unknown address (no proxy header, i.e. local) shares the server's window only.
  const known = request.headers.has("x-forwarded-for") || request.headers.has("x-real-ip")
  if (known && !take(`${example}:${visitorOf(request)}`, PER_VISITOR)) return false
  return take(example, PER_SERVER)
}

/** The three example quotes, checked in Zetaris in one statement against the sample paper. */
export async function checkExample() {
  const slug = env.DEMO_SHARE_SLUG
  if (!slug) throw new LibraryError("The sample space isn't set up on this server", 404)
  const share = await openShare(slug)
  const paper = share.files.find((f) => f.title.startsWith(ZETARIS_EXAMPLE.paper))
  if (!paper) throw new LibraryError("The sample paper isn't in the sample space", 404)
  const result = await checkQuotes(
    ZETARIS_EXAMPLE.quotes.map((q) => ({
      qid: q.id,
      fileId: paper.id,
      passageId: "",
      quote: q.text,
      transcript: false,
    })),
  )
  return { found: [...result.found], ms: result.ms, sql: result.sql }
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

/** The top open-access papers with a PDF copy for one of the example topics. */
export function searchExample(topic: number): Promise<ExampleWork[]> {
  const query = OPENALEX_TOPICS[topic]
  if (!query) throw new LibraryError("No such topic", 400)
  const cached = searches.get(topic)
  if (cached && Date.now() - cached.at < SEARCH_TTL_MS) return cached.works
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
  works.catch(() => searches.delete(topic))
  return works
}

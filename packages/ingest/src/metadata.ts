import { type CslItem, type CslName, type FileMeta, INGEST } from "@konkyo/config"
import { env } from "@konkyo/env/server"

export type { CslItem, CslName, FileMeta }

const OPENALEX = "https://api.openalex.org"
const SELECT =
  "id,doi,display_name,publication_year,publication_date,type,authorships,primary_location,biblio,cited_by_count,abstract_inverted_index"

const DOI_RE = /\b(10\.\d{4,9}\/[-._;()/:a-z0-9]*[a-z0-9])/i
const ARXIV_RE = /arxiv(?:\.org\/(?:abs|pdf)\/|[:\s_-]*)(\d{4}\.\d{4,5})/i

type Work = {
  id: string
  doi: string | null
  display_name: string | null
  publication_year: number | null
  publication_date: string | null
  type: string | null
  authorships?: { author?: { display_name?: string } }[]
  primary_location?: {
    source?: { display_name?: string; host_organization_name?: string; type?: string } | null
  }
  biblio?: {
    volume?: string | null
    issue?: string | null
    first_page?: string | null
    last_page?: string | null
  }
  cited_by_count?: number
  abstract_inverted_index?: Record<string, number[]> | null
}

async function openAlex<T>(path: string): Promise<T | null> {
  const key = env.OPENALEX_API_KEY
  const res = await fetch(`${OPENALEX}${path}`, {
    headers: {
      "user-agent": INGEST.userAgent,
      // In a header, never the URL: URLs end up in logs.
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    signal: AbortSignal.timeout(INGEST.metadataTimeoutMs),
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`OpenAlex answered ${res.status}`)
  return (await res.json()) as T
}

const byDoi = (doi: string) =>
  openAlex<Work>(`/works/doi:${encodeURIComponent(doi.toLowerCase())}?select=${SELECT}`)

/** Words only, lower case: titles compare equal across punctuation, case and line breaks. */
const words = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1)

function titleSimilarity(a: string, b: string) {
  const x = new Set(words(a))
  const y = new Set(words(b))
  if (!x.size || !y.size) return 0
  let common = 0
  for (const w of x) if (y.has(w)) common++
  return common / Math.max(x.size, y.size)
}

/** OpenAlex stores abstracts as word → positions; this puts the words back in order. */
function abstractText(index: Record<string, number[]> | null | undefined) {
  if (!index) return undefined
  const words: string[] = []
  for (const [word, positions] of Object.entries(index)) for (const p of positions) words[p] = word
  const text = words.filter(Boolean).join(" ")
  return text.length > 40 ? text : undefined
}

function splitName(name: string): CslName {
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return { literal: name.trim() }
  return { family: parts.at(-1), given: parts.slice(0, -1).join(" ") }
}

const CSL_TYPE: Record<string, string> = {
  article: "article-journal",
  preprint: "article",
  "book-chapter": "chapter",
  book: "book",
  dissertation: "thesis",
  dataset: "dataset",
  report: "report",
}

/** OpenAlex calls journal and conference papers both "article"; the venue's type tells them apart. */
function cslType(work: Work) {
  const venue = work.primary_location?.source?.type
  if (work.type === "article" && venue === "conference") return "paper-conference"
  if (work.type === "article" && venue === "repository") return "article"
  return CSL_TYPE[work.type ?? ""] ?? "article"
}

function toCsl(work: Work): CslItem {
  const date = work.publication_date?.split("-").map(Number)
  const { first_page, last_page, volume, issue } = work.biblio ?? {}
  const source = work.primary_location?.source
  return {
    type: cslType(work),
    title: work.display_name ?? undefined,
    author: work.authorships
      ?.map((a) => a.author?.display_name)
      .filter((n): n is string => Boolean(n))
      .map(splitName),
    issued: date?.length
      ? { "date-parts": [date] }
      : work.publication_year
        ? { "date-parts": [[work.publication_year]] }
        : undefined,
    "container-title": source?.display_name ?? undefined,
    publisher: source?.host_organization_name ?? undefined,
    volume: volume ?? undefined,
    issue: issue ?? undefined,
    page: first_page
      ? last_page && last_page !== first_page
        ? `${first_page}-${last_page}`
        : first_page
      : undefined,
    DOI: work.doi?.replace(/^https?:\/\/doi\.org\//i, ""),
    URL: work.doi ?? undefined,
    abstract: abstractText(work.abstract_inverted_index),
  }
}

const xml = (entry: string, tag: string) =>
  entry
    .match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1]
    ?.replace(/\s+/g, " ")
    .trim()

/** The arXiv listing itself: authoritative for an arXiv paper's title, authors and date. */
async function arxivRecord(id: string): Promise<CslItem | null> {
  const res = await fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`, {
    headers: { "user-agent": INGEST.userAgent },
    signal: AbortSignal.timeout(INGEST.metadataTimeoutMs),
  })
  if (!res.ok) return null
  const entry = (await res.text()).match(/<entry>([\s\S]*?)<\/entry>/)?.[1]
  const title = entry && xml(entry, "title")
  if (!entry || !title) return null
  const published = xml(entry, "published")?.slice(0, 10).split("-").map(Number)
  return {
    type: "article",
    title,
    author: [...entry.matchAll(/<author>\s*<name>([^<]+)<\/name>/g)].map((m) =>
      splitName(m[1] ?? ""),
    ),
    issued: published?.length ? { "date-parts": [published] } : undefined,
    "container-title": "arXiv",
    DOI: `10.48550/arXiv.${id}`,
    URL: `https://arxiv.org/abs/${id}`,
    abstract: xml(entry, "summary"),
  }
}

const yearOfCsl = (csl?: CslItem) => csl?.issued?.["date-parts"]?.[0]?.[0]

/**
 * Finds the published record of a document in OpenAlex: by the DOI printed in it or in its link,
 * then by its arXiv id, then by its title. A title search is accepted only when the titles match
 * closely, so a wrong paper is never attached; no match is a normal outcome.
 */
export async function findMetadata(input: {
  fileName: string
  title?: string
  text: string
  sourceUrl?: string | null
}): Promise<Pick<FileMeta, "csl" | "openalex" | "foundBy"> | null> {
  const head = input.text.slice(0, 8000)
  const found = (work: Work | null, foundBy: FileMeta["foundBy"]) =>
    work?.display_name
      ? {
          csl: toCsl(work),
          openalex: {
            id: work.id.replace("https://openalex.org/", ""),
            citedBy: work.cited_by_count ?? 0,
          },
          foundBy,
        }
      : null

  const doi = (input.sourceUrl?.match(DOI_RE) ?? head.match(DOI_RE))?.[1]?.replace(/[.,;)]+$/, "")
  // arXiv's own DOIs (10.48550/arXiv.<id>) take the arXiv path below, which checks for reposts.
  const arxivDoi = doi?.match(/^10\.48550\/arxiv\.(\d{4}\.\d{4,5})/i)?.[1]
  if (doi && !arxivDoi) {
    const hit = found(await byDoi(doi), "doi")
    if (hit) return hit
  }

  const arxiv =
    arxivDoi ??
    (input.fileName.match(ARXIV_RE) ??
      input.sourceUrl?.match(ARXIV_RE) ??
      head.match(ARXIV_RE))?.[1]
  if (arxiv) {
    // OpenAlex may hold the peer-reviewed version (keep it), or a later repost merged into the
    // arXiv record (wrong year and DOI). Its record is used only when it is the same paper from
    // about the same time; otherwise the arXiv listing is the record.
    const [listing, work] = await Promise.all([
      arxivRecord(arxiv).catch(() => null),
      byDoi(`10.48550/arXiv.${arxiv}`).catch(() => null),
    ])
    const hit = found(work, "arxiv")
    const sameTime =
      listing && hit?.csl
        ? Math.abs((yearOfCsl(hit.csl) ?? 0) - (yearOfCsl(listing) ?? 0)) <= 3 &&
          titleSimilarity(listing.title ?? "", hit.csl.title ?? "") >= 0.85
        : Boolean(hit)
    if (hit && sameTime) return hit
    if (listing) return { csl: listing, foundBy: "arxiv" }
  }

  const title = input.title?.trim()
  if (title && words(title).length >= 4) {
    const res = await openAlex<{ results: Work[] }>(
      `/works?search=${encodeURIComponent(title)}&per-page=3&select=${SELECT}`,
    )
    const best = res?.results
      .map((w) => ({ w, score: titleSimilarity(title, w.display_name ?? "") }))
      .sort((a, b) => b.score - a.score)[0]
    if (best && best.score >= 0.85) return found(best.w, "title")
  }
  return null
}

/** The DOI in a doi.org link (how a pasted DOI is imported). */
export function doiFromUrl(url: string | null | undefined): string | null {
  const m = url?.match(/^https?:\/\/(?:dx\.)?doi\.org\/(10\.\d{4,9}\/.+)$/i)
  return m?.[1] ? decodeURIComponent(m[1]) : null
}

/**
 * Where a DOI's paper can be read for free, best first: arXiv itself for arXiv DOIs, then every
 * open location OpenAlex knows with a PDF link (its "best" one is sometimes a dead mirror, so the
 * caller tries them in turn). Empty when there is no free copy: Konkyo then says so, instead of
 * saving the publisher's abstract page as "the paper".
 */
export async function openAccessPdfs(doi: string): Promise<string[]> {
  type Location = { pdf_url?: string | null; is_oa?: boolean }
  const arxiv = doi.match(/^10\.48550\/arxiv\.(.+)$/i)?.[1]
  const work = await openAlex<{ best_oa_location?: Location | null; locations?: Location[] }>(
    `/works/doi:${encodeURIComponent(doi.toLowerCase())}?select=best_oa_location,locations`,
  )
  const candidates = [
    arxiv ? `https://arxiv.org/pdf/${arxiv}` : null,
    ...(work?.locations ?? [])
      .filter((l) => l.is_oa && l.pdf_url)
      .map((l) => l.pdf_url as string)
      .sort((a, b) => Number(/arxiv\.org/.test(b)) - Number(/arxiv\.org/.test(a))),
    work?.best_oa_location?.pdf_url ?? null,
  ]
  return [...new Set(candidates.filter((u): u is string => Boolean(u)))]
}

/** Upload names like "arxiv-1711.05391.pdf" or "scan_003.pdf" read better as the real title. */
export const looksLikeFileName = (title: string) =>
  /\.[a-z0-9]{2,5}$/i.test(title) || /^(arxiv|doi|scan|document|untitled)[\s_.-]/i.test(title)

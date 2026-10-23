/**
 * The Writer's output format, measured in the cost benchmark (9/9 verbatim quotes):
 *
 *   <answer sentences, each with markers like [1] or [1][2]>
 *   Caveat: <one line>
 *   Sources:
 *   [1] p3: "<exact quote from passage p3>"
 *
 * The prose reads naturally, and every citation number carries its own checkable quote.
 */

export type SourceLine = { n: number; label: string; quote: string }
export type Sentence = { text: string; cites: number[] }

export type ParsedAnswer = {
  body: string
  caveat?: string
  sources: SourceLine[]
  sentences: Sentence[]
  notInLibrary: boolean
}

const MARKER = /\[(\d+(?:\s*[,–-]\s*\d+)*)\]/g
export const NOT_IN_LIBRARY = "NOT_IN_LIBRARY"

/** "[1]", "[1, 3]", "[2–4]" → [1], [1, 3], [2, 3, 4]. */
function markerNumbers(inner: string): number[] {
  const out: number[] = []
  for (const part of inner.split(",")) {
    const range = part.split(/[–-]/).map((x) => Number(x.trim()))
    const [a, b] = range
    if (a == null || Number.isNaN(a)) continue
    if (b != null && !Number.isNaN(b) && b >= a && b - a < 20)
      for (let n = a; n <= b; n++) out.push(n)
    else out.push(a)
  }
  return out
}

export const citesOf = (text: string) => [
  ...new Set([...text.matchAll(MARKER)].flatMap((m) => markerNumbers(m[1] ?? ""))),
]

const segmenter = new Intl.Segmenter("en", { granularity: "sentence" })

/** Sentences with their citation markers; markers stranded at a sentence's start join the one before. */
export function splitSentences(body: string): Sentence[] {
  const out: Sentence[] = []
  for (const paragraph of body.split(/\n{2,}/)) {
    for (const { segment } of segmenter.segment(paragraph)) {
      let text = segment.trim()
      if (!text) continue
      const lead = text.match(/^(\s*\[\d[^\]]*\]\s*)+/)?.[0]
      if (lead && out.length) {
        const prev = out[out.length - 1] as Sentence
        prev.text = `${prev.text} ${lead.trim()}`
        prev.cites = citesOf(prev.text)
        text = text.slice(lead.length).trim()
        if (!text) continue
      }
      out.push({ text, cites: citesOf(text) })
    }
  }
  return out
}

/**
 * A "sentence" that is nothing but a quotation (the Writer pasting its evidence into the prose,
 * a habit the benchmark saw): the citation chip already shows the quote, so it is dropped.
 */
const isPastedQuote = (text: string) =>
  /^["“'‘].*["”'’][.,;]?$/s.test(text.replace(/\[[^\]]*\]/g, "").trim())

/** Splits a (possibly partial, still streaming) Writer output into its parts. */
export function parseAnswer(raw: string): ParsedAnswer {
  const text = raw.replace(/\r/g, "")
  if (text.trim().startsWith(NOT_IN_LIBRARY))
    return { body: "", sources: [], sentences: [], notInLibrary: true }
  const sourcesAt = text.search(/^\s*\**sources:?\**\s*$/im)
  const head = sourcesAt >= 0 ? text.slice(0, sourcesAt) : text
  const tail = sourcesAt >= 0 ? text.slice(sourcesAt) : ""
  // "Caveat:" may start its own line or follow the last sentence on the same line.
  const caveatMatch = head.match(/(?:^|\s)\**caveat:?\**\s*(.+)$/is)
  const body = (caveatMatch ? head.slice(0, caveatMatch.index) : head).trim()
  const sources: SourceLine[] = []
  for (const line of tail.split("\n")) {
    const m = line.match(
      /^\s*[-*]?\s*\[(\d+)\]\s*\[?(p\d+)\]?\s*[:\-–]\s*["“'](.+?)["”']\s*\.?\s*$/i,
    )
    if (m) sources.push({ n: Number(m[1]), label: (m[2] ?? "").toLowerCase(), quote: m[3] ?? "" })
  }
  return {
    body,
    caveat: caveatMatch?.[1]?.replace(/\s+/g, " ").trim(),
    sources,
    sentences: splitSentences(body).filter((s) => !isPastedQuote(s.text)),
    notInLibrary: false,
  }
}

/**
 * The code check's quote key: letters and digits in any script, accents and symbols' combining
 * marks removed, so "Θ̂ 2" matches however the PDF encoded it; a changed word still fails.
 */
export const quoteKey = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}.]/gu, "")

/** Quote matching that forgives typography (curly quotes, spacing, case), not words. */
export const normalise = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()

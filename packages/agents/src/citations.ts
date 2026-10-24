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
export type Sentence = {
  text: string
  cites: number[]
  /** Its paragraph in the body (0-based): the body is rebuilt from sentences, never searched. */
  para: number
}

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

/**
 * A quotation pasted after a sentence's end ("… worse recall [2]. “caffeine did not …” [2]"):
 * a rewrite sometimes appends its evidence like this, and the segmenter keeps it in the same
 * sentence. The chip already shows the quote, so the tail goes.
 */
const PASTED_TAIL = /([.!?])\s+["“‘][^"”’]{12,}["”’]\s*(?:\[\d[^\]]*\]\s*)*\.?$/

/**
 * A quotation standing as sentences of its own (the Writer pasting its evidence into the prose):
 * it opens where a sentence would start and closes where one ends. A quote inside a sentence
 * (`found a “16% enhancement” [1].`, `“Sleep is vital,” they write`) is not matched.
 */
const STANDALONE_QUOTE =
  /(^|[.!?]["”’)]?(?:\s*\[\d[^\]]*\])*)\s*["“][^"“”]{12,}["”](?:\s*\[\d[^\]]*\])*\.?(?=\s*$|\s+[\p{Lu}"“[(])/gu

/** Sentences with their citation markers; markers stranded at a sentence's start join the one before. */
export function splitSentences(body: string): Sentence[] {
  const out: Sentence[] = []
  for (const [para, paragraph] of body.split(/\n{2,}/).entries()) {
    // A multi-sentence quotation would otherwise split into pieces that look like claims.
    for (const { segment } of segmenter.segment(paragraph.replace(STANDALONE_QUOTE, "$1"))) {
      let text = segment.trim()
      if (!text) continue
      const lead = text.match(/^(\s*\[\d[^\]]*\]\s*)+/)?.[0]
      if (lead && out.length) {
        const prev = out[out.length - 1] as Sentence
        // Only what the sentence before doesn't cite already ("… networks [1]. [1] The …").
        const extra = citesOf(lead).filter((n) => !prev.cites.includes(n))
        if (extra.length) {
          const markers = extra.map((n) => `[${n}]`).join("")
          // Markers belong before the sentence's own closing punctuation: "… solution [4][2]."
          prev.text = /[.!?]["”’)]*$/.test(prev.text)
            ? prev.text.replace(/\s*([.!?]["”’)]*)$/, ` ${markers}$1`)
            : `${prev.text} ${markers}`
          prev.cites = citesOf(prev.text)
        }
        text = text.slice(lead.length).trim()
        if (!text) continue
      }
      text = text.replace(PASTED_TAIL, "$1")
      out.push({ text, cites: citesOf(text), para })
    }
  }
  return out
}

/**
 * A "sentence" that is nothing but a quotation (the Writer pasting its evidence into the prose,
 * a habit the benchmark saw): the citation chip already shows the quote, so it is dropped.
 */
const isPastedQuote = (text: string) =>
  // Markers go with the space before them: `“…neocortex” [1].` must read `“…neocortex”.`
  /^["“'‘].*["”'’][.,;]?$/s.test(text.replace(/\s*\[[^\]]*\]/g, "").trim())

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
    // The caveat is never cited: a marker the Writer left there would point nowhere.
    caveat: caveatMatch?.[1]
      ?.replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, "")
      .replace(/\s+/g, " ")
      .trim(),
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

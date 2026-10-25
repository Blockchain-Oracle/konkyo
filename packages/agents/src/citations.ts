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
/**
 * Where the Writer's "Sources:" block starts: on its own line, or run on after the last sentence
 * or the caveat ("…sleep [1]. Sources: [1] p2: …"). It must be followed by an entry or a line end,
 * so "two sources: A and B" in a sentence is never taken for it.
 */
const SOURCES_AT = /(^|[.!?)\]]\s+)\**sources\**:?\**(?=\s*(?:\[\d+\]|$))/im
/** Where "Caveat:" starts: its own line, or after the last sentence on the same line. */
const CAVEAT_AT = /(^|[.!?)\]]\s+)\**caveat\**:/im

const startOf = (text: string, re: RegExp) => {
  const m = re.exec(text)
  return m ? m.index + (m[1]?.length ?? 0) : -1
}

/**
 * How much of a streaming draft is answer: everything before the caveat and the sources, which
 * are read when the draft is done, never shown as it streams. `final` is false while more text
 * may arrive, so the last few characters wait in case they begin "Caveat:" or "Sources:".
 */
export function bodyEnd(text: string, final: boolean) {
  const ends = [startOf(text, CAVEAT_AT), startOf(text, SOURCES_AT)].filter((i) => i >= 0)
  if (ends.length) return Math.min(...ends)
  return final ? text.length : Math.max(0, text.length - "**Sources:**".length)
}

export function parseAnswer(raw: string): ParsedAnswer {
  const text = raw.replace(/\r/g, "")
  if (text.trim().startsWith(NOT_IN_LIBRARY))
    return { body: "", sources: [], sentences: [], notInLibrary: true }
  const sourcesAt = startOf(text, SOURCES_AT)
  const head = sourcesAt >= 0 ? text.slice(0, sourcesAt) : text
  const tail = sourcesAt >= 0 ? text.slice(sourcesAt) : ""
  const caveatAt = startOf(head, CAVEAT_AT)
  const body = (caveatAt >= 0 ? head.slice(0, caveatAt) : head).trim()
  const caveatText =
    caveatAt >= 0 ? head.slice(caveatAt).replace(/^\**caveat\**:\**\s*/i, "") : undefined
  // Entries one per line or run together: [n] pN: "quote", the quote ending at its closing mark.
  const sources: SourceLine[] = []
  for (const m of tail.matchAll(
    /\[(\d+)\]\s*\[?(p\d+)\]?\s*[:\-–]\s*["“'](.+?)["”'](?=\s*\.?\s*(?:\n|\[\d+\]|[-*]\s|$))/gi,
  ))
    sources.push({ n: Number(m[1]), label: (m[2] ?? "").toLowerCase(), quote: m[3] ?? "" })
  return {
    body,
    // The caveat is never cited: a marker the Writer left there would point nowhere.
    caveat: caveatText
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

// Ported from the S00 document spike (.spikes/docs/lib/normalize.ts).
// Verifier normalization (Q7). Two levels:
//   normText(s) - readable, for display/diff:  NFKC (ligatures, full-width), accents folded, quotes/dashes unified,
//                 line-break hyphenation removed, intra-word hyphens removed, lowercase, whitespace collapsed.
//   normKey(s)  - the matching key: normText minus every character that is not a letter or digit.
//                 Immune to extractor spacing differences ("Wikime dia", "W¨urttemberg", "low-rank" vs "lowrank").
// A quote is verified when normKey(passage).includes(normKey(quote)) (and the same against Zetaris' own text).

// spacing accents that LaTeX PDFs emit as separate glyphs ("Lul´e", "W¨urttemberg")
const SPACING_ACCENTS = /[´¨¸ˆˇ˘˙˚˛˜˝`]/g

export function normText(s: string): string {
  return s
    .replace(SPACING_ACCENTS, "") // before NFKC, which would turn U+00B4 into a space + combining mark
    .normalize("NFKC") // ﬁ -> fi, ﬀ -> ff, full-width -> ASCII, superscript 2 -> 2
    .replace(/\u00AD|\u200B|\u200C|\u200D|\u2060|\uFEFF/g, "") // soft hyphen, zero-width chars
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .normalize("NFC") // e-acute -> e; Hangul/CJK recomposed intact
    .replace(/[‘’‚‛′ʼ]/g, "'")
    .replace(/[“”„‟″«»]/g, '"')
    .replace(/[‐‑‒–—―−﹘﹣－]/g, "-")
    .toLowerCase()
    .replace(/(\p{L})-\s+(\p{L})/gu, "$1$2") // "consoli-\ndation" -> "consolidation"
    .replace(/(\p{L})-(?=\p{L})/gu, "$1") // "low-rank" -> "lowrank" (both sides, so hyphen choices never matter)
    .replace(/\s+/g, " ")
    .trim()
}

export const normKey = (s: string) => normText(s).replace(/[^\p{L}\p{N}]/gu, "")

/** Deterministic Verifier check: returns the offset in the passage's key, or -1. */
export const findQuote = (passageText: string, quote: string) =>
  normKey(passageText).indexOf(normKey(quote))

/** Fallback for math-heavy lines where extractors order sub/superscripts differently:
 *  share of the quote key's 20-char chunks present in the target key (>= 0.8 passed 95-99.5% in Q7b). */
export function chunkCoverage(quote: string, target: string, n = 20): number {
  const q = normKey(quote),
    t = normKey(target)
  const chunks: string[] = []
  for (let i = 0; i + n <= q.length; i += n) chunks.push(q.slice(i, i + n))
  return chunks.length ? chunks.filter((c) => t.includes(c)).length / chunks.length : 0
}

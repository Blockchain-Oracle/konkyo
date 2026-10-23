/**
 * Answers checked in code first (plan F28): an exact or near-exact match is right, a missing
 * number is wrong, and anything else goes to the Tutor to judge.
 */
export type QuickGrade = "right" | "wrong" | "unsure"

const ARTICLES = /\b(a|an|the)\b/g

export function normalizeAnswer(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[‘’`]/g, "'")
    .replace(/[^\p{L}\p{N}%.' ]+/gu, " ")
    .replace(/(?<!\d)\.|\.(?!\d)/g, " ")
    .replace(ARTICLES, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const numbersIn = (text: string): string[] => [...(text.match(/\d+(?:\.\d+)?/g) ?? [])]

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0] as number
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const above = row[j] as number
      row[j] = Math.min(
        above + 1,
        (row[j - 1] as number) + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
      diagonal = above
    }
  }
  return row[b.length] as number
}

export function quickGrade(answer: string, keys: string[]): QuickGrade {
  const given = normalizeAnswer(answer)
  if (!given) return "wrong"
  const wanted = keys.map(normalizeAnswer).filter(Boolean)
  if (wanted.includes(given)) return "right"
  for (const key of wanted) {
    // Numbers are where answers go wrong: a missing or different one is never right.
    const needed = numbersIn(key)
    if (needed.length && !needed.every((n) => numbersIn(given).includes(n))) return "wrong"
    const words = key.split(" ").length
    // A short key with a typo ("hipocampus").
    if (words <= 3 && key.length >= 4) {
      const allowed = key.length <= 6 ? 1 : 2
      if (editDistance(given, key) <= allowed) return "right"
    }
    // The key inside a short answer ("it's the hippocampus").
    if (` ${given} `.includes(` ${key} `) && given.split(" ").length <= words + 4) return "right"
  }
  return "unsure"
}

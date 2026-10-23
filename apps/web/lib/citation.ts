import type { CslItem, CslName } from "@konkyo/config"

export const personName = (n: CslName) => n.literal ?? [n.given, n.family].filter(Boolean).join(" ")

/** "Xie, Liu and Hero", or "Xie, Liu, Hero et al." past four names. */
export function authorsLine(csl?: CslItem): string | undefined {
  const names = csl?.author?.map(personName).filter(Boolean)
  if (!names?.length) return undefined
  if (names.length > 4) return `${names.slice(0, 3).join(", ")} et al.`
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
}

export const yearOf = (csl?: CslItem) => csl?.issued?.["date-parts"]?.[0]?.[0]

const BIBTEX_TYPE: Record<string, string> = {
  "article-journal": "article",
  article: "misc",
  "paper-conference": "inproceedings",
  chapter: "incollection",
  book: "book",
  thesis: "phdthesis",
  report: "techreport",
}

/** Braces protect capitals and special characters inside BibTeX values. */
const value = (s: string) => `{${s.replace(/[{}]/g, "")}}`

/** One BibTeX entry, keyed "xie2017semiblind" (family name, year, first title word). */
export function toBibtex(csl: CslItem, fallbackTitle: string): string {
  const title = csl.title ?? fallbackTitle
  const year = yearOf(csl)
  const first = csl.author?.[0]
  const key = [
    (first?.family ?? first?.literal ?? "source").toLowerCase().replace(/[^a-z]/g, ""),
    year ?? "",
    (title.toLowerCase().match(/[a-z]{4,}/)?.[0] ?? "").slice(0, 12),
  ].join("")
  const venueField = csl.type === "article-journal" ? "journal" : "booktitle"
  const fields: [string, string | undefined][] = [
    ["title", title],
    [
      "author",
      csl.author
        ?.map((n) => (n.family ? `${n.family}, ${n.given ?? ""}`.trim() : (n.literal ?? "")))
        .join(" and "),
    ],
    ["year", year?.toString()],
    [venueField, csl["container-title"]],
    ["publisher", csl.publisher],
    ["volume", csl.volume],
    ["number", csl.issue],
    ["pages", csl.page?.replace(/-+/, "--")],
    ["doi", csl.DOI],
    ["url", csl.DOI ? undefined : csl.URL],
  ]
  const body = fields
    .filter((f): f is [string, string] => Boolean(f[1]))
    .map(([k, v]) => `  ${k} = ${value(v)}`)
    .join(",\n")
  return `@${BIBTEX_TYPE[csl.type] ?? "misc"}{${key},\n${body}\n}`
}

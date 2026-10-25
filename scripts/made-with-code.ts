// The made-with pages' code (plan F61). Every step on a partner's page names a file and a
// function; this finds that function in the source, highlights it and writes one file per
// partner to apps/web/public/made-with/<partner>.json, which the page fetches when someone opens
// "follow it in the code". Found by name, not by line, so moving code doesn't break a step, and a
// name that no longer exists fails loudly. Run after changing a referenced function:
//   pnpm made-with:code
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { codeToHtml } from "shiki"
import { type CodeRef, codeKey, PARTNERS } from "../apps/web/lib/made-with.ts"

const root = join(import.meta.dirname, "..")
/** An excerpt longer than this is cut, with a note of how much more there is. */
const MAX_LINES = 40
const LANG: Record<string, string> = { ts: "ts", tsx: "tsx", sql: "sql", css: "css", mjs: "js" }

const literally = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** The line a declaration of `symbol` starts on: function, const, class, method, key or table. */
function startOf(lines: string[], symbol: string) {
  const name = literally(symbol)
  const patterns = [
    new RegExp(`^\\s*(export\\s+)?(default\\s+)?(async\\s+)?function\\*?\\s+${name}\\b`),
    new RegExp(`^\\s*(export\\s+)?(const|let)\\s+${name}\\b`),
    new RegExp(`^\\s*(export\\s+)?(abstract\\s+)?class\\s+${name}\\b`),
    new RegExp(`^\\s*(export\\s+)?(type|interface)\\s+${name}\\b`),
    new RegExp(`^\\s*(public\\s+|private\\s+|static\\s+)*(async\\s+)?${name}\\s*[(<]`),
    new RegExp(`^\\s*"?${name}"?\\s*:`),
    new RegExp(`^\\s*CREATE (UNIQUE )?(TABLE|INDEX)[^;]*\\b${name}\\b`, "i"),
  ]
  for (const pattern of patterns) {
    const at = lines.findIndex((line) => pattern.test(line))
    if (at >= 0) return at
  }
  return -1
}

/** A line without its escapes, strings and comments: only the brackets that are code. */
const codeOf = (line: string, string = "") =>
  line
    .replace(/\\./g, "")
    .replace(/(["'`])(?:(?!\1).)*\1/g, string)
    .replace(/(^|\s)(\/\/|--\s).*$/, "")
    .trim()

/** The expression goes on: the line ends mid-expression, or the next one continues it. */
const continues = (line: string, next: string | undefined) =>
  /(=>|=|\?|:|,|\(|&&|\|\||\+)$/.test(codeOf(line, "0")) ||
  /^(\.|\?|:|&&|\|\||\+|as\s)/.test((next ?? "").trim())

/** Where the declaration ends: the bracket depth comes back to where it started. */
function endOf(lines: string[], start: number) {
  let depth = 0
  let opened = false
  let carry = false
  for (let i = start; i < lines.length; i++) {
    const code = codeOf(lines[i] ?? "")
    for (const ch of code) {
      if (ch === "{" || ch === "(" || ch === "[") {
        depth++
        opened = true
      } else if (ch === "}" || ch === ")" || ch === "]") depth--
    }
    if (depth > 0) continue
    // a comment line inside an expression that goes on
    if (!codeOf(lines[i] ?? "", "0") && carry) continue
    carry = continues(lines[i] ?? "", lines[i + 1])
    if (carry) continue
    if (opened) return i
    // a one-line declaration with no brackets (a const of a string, a SQL statement)
    if (/;\s*$|^\s*$/.test(lines[i] ?? "")) return i
  }
  return lines.length - 1
}

export type Excerpt = {
  file: string
  symbol: string
  /** The first and last line shown, as numbered in the file. */
  from: number
  to: number
  /** How many more lines the function has past the cut, or 0. */
  more: number
  html: string
}

async function excerpt(ref: CodeRef): Promise<Excerpt> {
  const lines = readFileSync(join(root, ref.file), "utf8").split("\n")
  const start = startOf(lines, ref.symbol)
  if (start < 0) throw new Error(`no "${ref.symbol}" in ${ref.file}`)
  // keep the comment just above it: it says what the function is for
  let from = start
  while (from > 0 && /^\s*(\/\/|\*|\/\*\*|\*\/|--)/.test(lines[from - 1])) from--
  const end = endOf(lines, start)
  const body = lines.slice(from, end + 1)
  const shown = body.slice(0, MAX_LINES)
  const html = await codeToHtml(shown.join("\n"), {
    lang: LANG[ref.file.split(".").at(-1) ?? ""] ?? "text",
    theme: "github-light-high-contrast",
  })
  return {
    file: ref.file,
    symbol: ref.symbol,
    from: from + 1,
    to: from + shown.length,
    more: body.length - shown.length,
    html,
  }
}

const dir = join(root, "apps/web/public/made-with")
mkdirSync(dir, { recursive: true })
let total = 0
for (const partner of PARTNERS) {
  const refs = [
    ...partner.journey.map((s) => s.code),
    ...partner.capabilities.map((s) => s.code),
    ...partner.technical.map((s) => s.code),
  ]
  const out: Record<string, Excerpt> = {}
  for (const ref of refs) {
    const key = codeKey(ref)
    if (out[key]) continue
    try {
      out[key] = await excerpt(ref)
    } catch (error) {
      throw new Error(`${partner.id}: ${(error as Error).message}`)
    }
  }
  writeFileSync(join(dir, `${partner.id}.json`), `${JSON.stringify(out)}\n`)
  total += Object.keys(out).length
}
console.log(`made-with: ${total} excerpts for ${PARTNERS.length} partners`)

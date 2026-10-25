// The made-with pages' code (plan F61). Every step on a partner's page names a file and a
// function; this finds that function in the source, highlights it and writes one file per
// partner to apps/web/public/made-with/<partner>.json, which the page fetches when someone opens
// "follow it in the code". Found by name, not by line, so moving code doesn't break a step, and a
// name that no longer exists fails loudly. Run after changing a referenced function:
//   pnpm made-with:code
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { parse } from "@babel/parser"
import type { Statement } from "@babel/types"
import { codeToHtml } from "shiki"
import { type CodeRef, codeKey, PARTNERS } from "../apps/web/lib/made-with.ts"

const root = join(import.meta.dirname, "..")
/** An excerpt longer than this is cut, with a note of how much more there is. */
const MAX_LINES = 60
const LANG: Record<string, string> = { ts: "ts", tsx: "tsx" }

/** A top-level declaration's name, unwrapping `export` and `export default`. */
function namesOf(node: Statement): string[] {
  const inner =
    node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration"
      ? node.declaration
      : node
  if (!inner) return []
  switch (inner.type) {
    case "FunctionDeclaration":
    case "ClassDeclaration":
    case "TSTypeAliasDeclaration":
    case "TSInterfaceDeclaration":
      return inner.id ? [inner.id.name] : []
    case "VariableDeclaration":
      return inner.declarations.flatMap((d) => (d.id.type === "Identifier" ? [d.id.name] : []))
    default:
      return []
  }
}

/**
 * Where `symbol` is declared at the top level of the file, by a real parse (Babel, TypeScript +
 * JSX): its first and last line, 0-based. A bracket counter got regexes and multi-line template
 * strings wrong (a `)` in a regex ended findMetadata 42 lines early).
 */
function rangeOf(source: string, file: string, symbol: string) {
  const ast = parse(source, {
    sourceType: "module",
    plugins: ["typescript", ...(file.endsWith(".tsx") ? (["jsx"] as const) : [])],
  })
  const node = ast.program.body.find((n) => namesOf(n).includes(symbol))
  if (!node?.loc) return null
  return { start: node.loc.start.line - 1, end: node.loc.end.line - 1 }
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
  const source = readFileSync(join(root, ref.file), "utf8")
  const lines = source.split("\n")
  const range = rangeOf(source, ref.file, ref.symbol)
  if (!range) throw new Error(`no top-level "${ref.symbol}" in ${ref.file}`)
  const { start, end } = range
  // keep the comment just above it: it says what the function is for
  let from = start
  while (from > 0 && /^\s*(\/\/|\*|\/\*\*|\*\/)/.test(lines[from - 1] ?? "")) from--
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

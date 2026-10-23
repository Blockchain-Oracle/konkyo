import "server-only"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { plugins } from "@citation-js/core"
import "@citation-js/plugin-csl"
import { LibraryError } from "./library"

/**
 * Citation styles (plan F26): any style in the Citation Style Language's own repository, by its
 * id. The common ones are listed first; the rest are found by name. A style is fetched once and
 * kept on disk.
 */
export const COMMON_STYLES = [
  { id: "apa", name: "APA 7th" },
  { id: "modern-language-association", name: "MLA 9th" },
  { id: "chicago-author-date", name: "Chicago (author-date)" },
  { id: "chicago-notes-bibliography", name: "Chicago (notes and bibliography)" },
  { id: "harvard-cite-them-right", name: "Harvard (Cite Them Right)" },
  { id: "ieee", name: "IEEE" },
  { id: "vancouver", name: "Vancouver" },
  { id: "nature", name: "Nature" },
  { id: "american-medical-association", name: "AMA" },
] as const

const ROOT = path.resolve(process.env.KONKYO_ROOT ?? process.cwd(), ".data", "csl")
const RAW = "https://raw.githubusercontent.com/citation-style-language/styles/master"
const BUNDLED = new Set(["apa", "vancouver", "harvard1"])

const csl = () =>
  plugins.config.get("@csl") as unknown as {
    styles: { add: (name: string, xml: string) => void; has: (name: string) => boolean }
  }

export type StyleInfo = { id: string; kind: "in-text" | "numeric" | "note"; xml: string | null }

const kindOf = (xml: string | null, id: string): StyleInfo["kind"] => {
  const format = xml?.match(/citation-format="([^"]+)"/)?.[1]
  if (format === "numeric") return "numeric"
  if (format === "note" || /class="note"/.test(xml ?? "")) return "note"
  return id === "vancouver" ? "numeric" : "in-text"
}

/** Registers a style with citation-js (fetching it the first time) and says how it cites. */
export async function loadStyle(id: string): Promise<StyleInfo> {
  if (!/^[a-z0-9-]{2,120}$/.test(id)) throw new LibraryError("That isn't a citation style")
  if (BUNDLED.has(id)) return { id, kind: kindOf(null, id), xml: null }
  const file = path.join(ROOT, `${id}.csl`)
  let xml = await readFile(file, "utf8").catch(() => null)
  if (!xml) {
    const res = await fetch(`${RAW}/${id}.csl`, { signal: AbortSignal.timeout(10_000) }).catch(
      () => null,
    )
    if (!res?.ok) throw new LibraryError(`There's no citation style called “${id}”`, 404)
    xml = await res.text()
    // A "dependent" style only points at its parent's rules: use the parent's.
    const parent = xml.match(
      /<link[^>]+rel="independent-parent"[^>]+href="[^"]*\/([a-z0-9-]+)"/,
    )?.[1]
    if (parent && parent !== id) {
      const base = await loadStyle(parent)
      if (base.xml) xml = base.xml
    }
    await mkdir(ROOT, { recursive: true })
    await writeFile(file, xml)
  }
  if (!csl().styles.has(id)) csl().styles.add(id, xml)
  return { id, kind: kindOf(xml, id), xml }
}

const INDEX = path.join(ROOT, "_index.json")
const WEEK = 7 * 86_400_000

/** Every style id in the CSL repository (refreshed weekly), for the export's style search. */
async function allStyles(): Promise<string[]> {
  const fresh = await stat(INDEX)
    .then((s) => Date.now() - s.mtimeMs < WEEK)
    .catch(() => false)
  if (fresh) return JSON.parse(await readFile(INDEX, "utf8")) as string[]
  const res = await fetch(
    "https://api.github.com/repos/citation-style-language/styles/git/trees/master",
    {
      headers: { accept: "application/vnd.github+json", "user-agent": "KonkyoBot/1.0" },
      signal: AbortSignal.timeout(10_000),
    },
  ).catch(() => null)
  if (!res?.ok) return COMMON_STYLES.map((s) => s.id)
  const tree = (await res.json()) as { tree: { path: string; type: string }[] }
  const ids = tree.tree
    .filter((t) => t.type === "blob" && t.path.endsWith(".csl"))
    .map((t) => t.path.replace(/\.csl$/, ""))
  await mkdir(ROOT, { recursive: true })
  await writeFile(INDEX, JSON.stringify(ids))
  return ids
}

const readable = (id: string) =>
  id
    .split("-")
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0]?.toUpperCase() + w.slice(1)))
    .join(" ")

/** Styles for the picker: the common ones when there's no query, else the best name matches. */
export async function searchStyles(query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return COMMON_STYLES.map((s) => ({ ...s }))
  const words = q.split(/\s+/)
  const common = COMMON_STYLES.filter((s) =>
    words.every((w) => `${s.id} ${s.name}`.toLowerCase().includes(w)),
  )
  const rest = (await allStyles())
    .filter((id) => words.every((w) => id.includes(w)) && !common.some((c) => c.id === id))
    .sort((a, b) => a.length - b.length)
    .slice(0, 30)
    .map((id) => ({ id, name: readable(id) }))
  return [...common.map((s) => ({ ...s })), ...rest]
}

import { mkdir, rename, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { ZETARIS } from "@konkyo/config"
import { env } from "@konkyo/env/server"
import { literal, run, ZetarisError } from "./client"

/**
 * Konkyo's evidence store in Zetaris (plan §3 "Where data lives"):
 *   konkyo.konkyo_passages: one JSON file per document with every passage's text.
 *   konkyo.konkyo_pdf_text: one JSON file per PDF with Zetaris's *own* PDFBox text, normalised.
 * The Verifier checks every quote against these before it reaches anyone.
 */

const DB = ZETARIS.database
const FOLDERS = { originals: "originals", passages: "passages", pdfText: "pdf_text" } as const

export type EvidencePassage = {
  pid: string
  kind: string
  text: string
  t_start: number | null
  t_end: number | null
  speaker: string | null
}

export type EvidenceDoc = {
  doc_id: string
  kind: string
  title: string
  pages: { page: number; passages: EvidencePassage[] }[]
}

/**
 * The quote-matching key Zetaris computes in SQL: lowercase, then keep only a–z, 0–9 and ".".
 * S00 measured it at 10/10 on real quotes while still catching a planted "1.2 → 12".
 */
export const evidenceKey = (text: string) => text.toLowerCase().replace(/[^a-z0-9.]/g, "")
export const EVIDENCE_KEY_SQL = (column: string) =>
  `regexp_replace(lower(${column}), '[^a-z0-9.]', '')`

const localPath = (folder: string, name: string) => join(env.EVIDENCE_DIR, folder, name)
const zetarisPath = (folder: string, name = "") =>
  `${env.ZETARIS_EVIDENCE_URI.replace(/\/$/, "")}/${folder}/${name}`

/** Spark skips names that start with "." or "_", so a half-written file is never read. */
async function writeAtomic(folder: string, name: string, data: string | Uint8Array) {
  await mkdir(join(env.EVIDENCE_DIR, folder), { recursive: true })
  const temp = localPath(folder, `.${name}.tmp`)
  await writeFile(temp, data)
  await rename(temp, localPath(folder, name))
}

const tableFor = (fileId: string) => `konkyo_pdf_${fileId.replaceAll("-", "")}`

async function existingTables(): Promise<Set<string>> {
  const { rows } = await run(`SHOW LIGHTNING TABLES ${DB}`)
  return new Set(rows.map((r) => String(r.name)))
}

/**
 * Creates the database and the two evidence tables if they're missing. A table's schema is fixed when it is
 * registered, so each starts from a seed document that has every optional field with its real type
 * (0.5 rather than 0, so numbers are inferred as doubles).
 */
let ensured: Promise<void> | undefined

/** Once per process: later files skip the table check (about 4 s each). */
export function ensureEvidenceTables(): Promise<void> {
  ensured ??= createEvidenceTables().catch((error) => {
    ensured = undefined
    throw error
  })
  return ensured
}

async function createEvidenceTables(): Promise<void> {
  try {
    await run(`CREATE LIGHTNING DATABASE ${DB} DESCRIBE BY "Konkyo evidence store"`)
  } catch (error) {
    if (!(error instanceof ZetarisError && /already exists/i.test(error.message))) throw error
  }
  const tables = await existingTables()
  if (!tables.has(ZETARIS.tables.passages)) {
    const seed: EvidenceDoc = {
      doc_id: "__seed__",
      kind: "seed",
      title: "seed",
      pages: [
        {
          page: 0,
          passages: [
            { pid: "__seed__", kind: "text", text: "", t_start: 0.5, t_end: 0.5, speaker: "" },
          ],
        },
      ],
    }
    await writeAtomic(FOLDERS.passages, "seed.json", JSON.stringify(seed))
    await run(
      `CREATE LIGHTNING FILESTORE TABLE ${ZETARIS.tables.passages} FROM ${DB} FORMAT JSON OPTIONS (path "${zetarisPath(FOLDERS.passages)}", multiLine "true")`,
    )
  }
  if (!tables.has(ZETARIS.tables.pdfText)) {
    await writeAtomic(
      FOLDERS.pdfText,
      "seed.json",
      JSON.stringify({ doc_id: "__seed__", n_chars: 0, p: "" }),
    )
    await run(
      `CREATE LIGHTNING FILESTORE TABLE ${ZETARIS.tables.pdfText} FROM ${DB} FORMAT JSON OPTIONS (path "${zetarisPath(FOLDERS.pdfText)}", multiLine "true")`,
    )
  }
}

/**
 * Page furniture in Zetaris's PDFBox reading, which Konkyo's own extraction drops by position:
 * a preprint's margin line numbers ("… at high levels it 915\n inhibits …") and running heads
 * and feet on every page. Left in, a quote running past one failed the check though it is
 * verbatim in the paper (in testing: 3 of 10 brief quotes). Only provable furniture goes: a trailing
 * number that continues the previous or next line's by one, and a short line that repeats three
 * or more times, numbers aside. Removing text can only make a match harder, never pass a quote
 * the paper doesn't contain.
 */
export function withoutPageFurniture(text: string): string {
  const lines = text.split("\n")
  const trailing = lines.map((l) => {
    const m = l.match(/\s(\d{1,5})\s*$/)
    return m ? Number(m[1]) : null
  })
  const numbered = (i: number) => {
    const n = trailing[i]
    if (n == null) return false
    const prev = trailing[i - 1]
    const next = trailing[i + 1]
    return (prev != null && n === prev + 1) || (next != null && n === next - 1)
  }
  const shape = (l: string) => l.replace(/\d+/g, "#").trim()
  const counts = new Map<string, number>()
  for (const l of lines) {
    const s = shape(l)
    if (s.length >= 4 && s.length <= 120) counts.set(s, (counts.get(s) ?? 0) + 1)
  }
  return lines
    .map((l, i) => {
      if ((counts.get(shape(l)) ?? 0) >= 3 || /^\s*\d{1,5}\s*$/.test(l)) return ""
      return numbered(i) ? l.replace(/\s\d{1,5}\s*$/, "") : l
    })
    .join("\n")
}

/** Writes a document's passages; uncached FILESTORE tables see new files on the next query (S00). */
export async function publishPassages(doc: EvidenceDoc): Promise<void> {
  await writeAtomic(FOLDERS.passages, `${doc.doc_id}.json`, JSON.stringify(doc))
}

/**
 * Hands a PDF rendition to Zetaris and stores Zetaris's own text for it. Reading text through a
 * per-document PDF table once, then keeping it as small JSON, is the fast form: one folder-wide PDF
 * table re-parsed every PDF on every query (6.6 s at 60 PDFs in S00).
 */
export async function publishPdfText(fileId: string, pdf: Uint8Array): Promise<{ chars: number }> {
  await writeAtomic(FOLDERS.originals, `${fileId}.pdf`, pdf)
  const table = tableFor(fileId)
  // A job cut off between CREATE and DROP leaves the table behind; clear it so a retry can run.
  await run(`DROP LIGHTNING DATABASE TABLE ${DB}.${table}`).catch(() => undefined)
  // `preview_len` is undocumented; without it Zetaris stops reading after 1,000 characters.
  await run(
    `CREATE LIGHTNING FILESTORE TABLE ${table} FROM ${DB} FORMAT PDF OPTIONS (path "${zetarisPath(FOLDERS.originals, `${fileId}.pdf`)}", preview_len "2000000", preview_max_bytes "200000000")`,
  )
  try {
    const { rows } = await run(`SELECT preview FROM ${DB}.${table}`, {
      timeoutMs: ZETARIS.queryTimeoutMs * 4,
    })
    const text = rows.map((r) => r.preview ?? "").join("\n")
    const p = evidenceKey(withoutPageFurniture(text))
    await writeAtomic(
      FOLDERS.pdfText,
      `${fileId}.json`,
      JSON.stringify({ doc_id: fileId, n_chars: text.length, p }),
    )
    return { chars: text.length }
  } finally {
    await run(`DROP LIGHTNING DATABASE TABLE ${DB}.${table}`).catch(() => undefined)
  }
}

/** Confirms Zetaris now answers for this document (the file is marked Ready only after this). */
export async function confirmPublished(fileId: string): Promise<number> {
  const { rows } = await run(
    `SELECT count(*) AS n FROM ${DB}.${ZETARIS.tables.passages} d LATERAL VIEW explode(d.pages) pg AS p LATERAL VIEW explode(p.passages) ps AS x WHERE d.doc_id = ${literal(fileId)}`,
  )
  return Number(rows[0]?.n ?? 0)
}

/** Removes a document's evidence files (file deleted, or account deleted). */
export async function unpublish(fileId: string): Promise<void> {
  await Promise.all([
    rm(localPath(FOLDERS.passages, `${fileId}.json`), { force: true }),
    rm(localPath(FOLDERS.pdfText, `${fileId}.json`), { force: true }),
    rm(localPath(FOLDERS.originals, `${fileId}.pdf`), { force: true }),
  ])
}

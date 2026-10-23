import { createHash } from "node:crypto"
import { ZETARIS } from "@konkyo/config"
import { literal, run } from "./client"
import { EVIDENCE_KEY_SQL, evidenceKey } from "./evidence"

const DB = ZETARIS.database
const PASSAGES = `${DB}.${ZETARIS.tables.passages}`
const PDF_TEXT = `${DB}.${ZETARIS.tables.pdfText}`

const inList = (values: string[]) => values.map(literal).join(", ")
export const sqlHash = (statement: string) =>
  createHash("sha256").update(statement).digest("hex").slice(0, 12)

/** Every passage of these documents, exploded to one row each, with its quote key. */
const passageRows = (docIds: string[]) => `
  SELECT d.doc_id AS doc, x.pid AS pid, ${EVIDENCE_KEY_SQL("x.text")} AS k
  FROM ${PASSAGES} d
  LATERAL VIEW explode(d.pages) pg AS p
  LATERAL VIEW explode(p.passages) ps AS x
  WHERE d.doc_id IN (${inList(docIds)})`

/**
 * Pre-check (plan §3 answer flow, step 3): which documents Zetaris holds right now. Passages of a
 * document missing here (re-processed, deleted, never confirmed) are dropped before the Writer
 * sees them. Document-level on purpose: exploding every passage cost 2.5 s; this costs about 1.
 */
export async function presentDocuments(docIds: string[]) {
  const statement = `SELECT doc_id FROM ${PASSAGES} WHERE doc_id IN (${inList(docIds)})`
  const started = performance.now()
  const { rows } = await run(statement, { timeoutMs: ZETARIS.queryTimeoutMs })
  return {
    present: new Set(rows.map((r) => String(r.doc_id))),
    sql: statement,
    ms: Math.round(performance.now() - started),
  }
}

export type QuoteCheck = {
  qid: string
  fileId: string
  passageId: string
  quote: string
  /** Recordings have no PDF; their quotes are checked against the stored transcript passage. */
  transcript: boolean
}

/**
 * The Verifier's evidence check (plan F12): every quote of an answer in **one** statement, as a
 * VALUES list. Documents are checked against Zetaris's own PDFBox reading of the PDF (a second,
 * independent extraction); recordings against the stored transcript passage. A quote counts
 * only if its normalised words appear verbatim.
 */
export async function checkQuotes(quotes: QuoteCheck[]) {
  if (!quotes.length) return { found: new Set<string>(), sql: "", ms: 0, rows: 0 }
  const row = (q: QuoteCheck) =>
    `(${literal(q.qid)}, ${literal(q.fileId)}, ${literal(q.passageId)}, ${literal(evidenceKey(q.quote))})`
  const documents = quotes.filter((q) => !q.transcript)
  const transcripts = quotes.filter((q) => q.transcript)
  const branches: string[] = []
  if (documents.length)
    branches.push(`SELECT q.qid
FROM VALUES
    ${documents.map(row).join(",\n    ")}
  AS q(qid, doc, pid, qkey)
JOIN ${PDF_TEXT} t ON t.doc_id = q.doc
WHERE instr(t.p, q.qkey) > 0`)
  if (transcripts.length)
    branches.push(`SELECT q.qid
FROM VALUES
    ${transcripts.map(row).join(",\n    ")}
  AS q(qid, doc, pid, qkey)
JOIN (${passageRows([...new Set(transcripts.map((q) => q.fileId))])}) e ON e.pid = q.pid
WHERE instr(e.k, q.qkey) > 0`)
  const statement = branches.join("\nUNION ALL\n")
  const started = performance.now()
  const { rows } = await run(statement, { timeoutMs: ZETARIS.queryTimeoutMs })
  return {
    found: new Set(rows.map((r) => String(r.qid))),
    sql: statement,
    ms: Math.round(performance.now() - started),
    rows: rows.length,
  }
}

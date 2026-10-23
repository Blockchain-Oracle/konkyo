import { db, schema } from "@konkyo/db"
import {
  confirmPublished,
  type EvidenceDoc,
  ensureEvidenceTables,
  publishPassages,
} from "@konkyo/zetaris"
import { eq } from "drizzle-orm"
import { embed, groupByPage } from "./pipeline"

const { files, notes, passages } = schema

type NewPassage = typeof passages.$inferInsert

/** Paragraphs joined up to about this many characters make one passage. */
const PASSAGE_CHARS = 900

/**
 * A note read for chat (plan F21): its paragraphs become passages (embedded, and published to
 * Zetaris like any document's, so a chat quote from the note is checked too). Chat cites it as
 * "your note"; Check my draft never counts notes as evidence.
 */
export async function indexNote(fileId: string) {
  const note = await db.query.notes.findFirst({ where: eq(notes.fileId, fileId) })
  const file = await db.query.files.findFirst({ where: eq(files.id, fileId) })
  if (!note || !file || file.deletedAt) return

  const blocks = note.text
    .split(/\n{2,}/)
    .map((b) => b.replace(/\s+/g, " ").trim())
    .filter((b) => b.length > 0)
  const chunks: string[] = []
  for (const block of blocks) {
    const last = chunks.at(-1)
    if (last && last.length + block.length < PASSAGE_CHARS)
      chunks[chunks.length - 1] = `${last}\n${block}`
    else chunks.push(block)
  }
  const rows: NewPassage[] = chunks.map((text, ordinal) => ({
    id: `${fileId}:n${ordinal}`,
    fileId,
    ownerId: file.ownerId,
    ordinal,
    kind: "note",
    text,
  }))

  if (rows.length) await embed(rows)
  await db.transaction(async (tx) => {
    await tx.delete(passages).where(eq(passages.fileId, fileId))
    for (let i = 0; i < rows.length; i += 200)
      await tx.insert(passages).values(rows.slice(i, i + 200))
  })
  if (rows.length) {
    await ensureEvidenceTables()
    const doc: EvidenceDoc = {
      doc_id: fileId,
      kind: "note",
      title: file.title,
      pages: groupByPage(rows),
    }
    await publishPassages(doc)
    const confirmed = await confirmPublished(fileId)
    if (confirmed !== rows.length)
      throw new Error(`Zetaris holds ${confirmed} of ${rows.length} note passages`)
  }
  await db.update(notes).set({ indexedAt: new Date() }).where(eq(notes.fileId, fileId))
  console.info(`[note] ${fileId} read into ${rows.length} passages`)
}

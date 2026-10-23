import "server-only"
import { db, schema } from "@konkyo/db"
import { and, asc, eq } from "drizzle-orm"
import { LibraryError } from "./library"

const { highlights, files } = schema

type Box = [number, number, number, number]

export async function listHighlights(ownerId: string, fileId: string) {
  return db
    .select({
      id: highlights.id,
      page: highlights.page,
      rects: highlights.rects,
      text: highlights.text,
      createdAt: highlights.createdAt,
    })
    .from(highlights)
    .where(and(eq(highlights.ownerId, ownerId), eq(highlights.fileId, fileId)))
    .orderBy(asc(highlights.page), asc(highlights.createdAt))
}

export type Highlight = Awaited<ReturnType<typeof listHighlights>>[number]

export async function addHighlights(
  ownerId: string,
  fileId: string,
  marks: { page: number; rects: Box[]; text: string }[],
) {
  const file = await db.query.files.findFirst({
    where: and(eq(files.id, fileId), eq(files.ownerId, ownerId)),
  })
  if (!file) throw new LibraryError("No such file", 404)
  return (
    db
      .insert(highlights)
      // PDF text arrives with its line breaks (\r\n); a highlight reads as one run of text.
      .values(
        marks.map((m) => ({ ...m, text: m.text.replace(/\s+/g, " ").trim(), ownerId, fileId })),
      )
      .returning({ id: highlights.id })
  )
}

export async function removeHighlight(ownerId: string, id: string) {
  await db.delete(highlights).where(and(eq(highlights.id, id), eq(highlights.ownerId, ownerId)))
}

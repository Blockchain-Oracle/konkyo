import "server-only"
import type { Citation, KonkyoMessage, Receipt } from "@konkyo/agents"
import { db, schema } from "@konkyo/db"
import type { PinCitation } from "@konkyo/db/schema"
import { and, desc, eq } from "drizzle-orm"
import { LibraryError, ownFolder } from "./library"

const { spacePins, messages, runs } = schema

export type Pin = {
  id: string
  question: string
  body: string
  citations: PinCitation[]
  quotes: number
  chatId: string | null
  createdAt: string
}

const view = (row: typeof spacePins.$inferSelect): Pin => ({
  id: row.id,
  question: row.question,
  body: row.body,
  citations: row.citations,
  quotes: row.quotes,
  chatId: row.chatId,
  createdAt: row.createdAt.toISOString(),
})

/** A space is a top-level folder you own (shared spaces widen this in S19). */
async function ownSpace(ownerId: string, spaceId: string) {
  const folder = await ownFolder(ownerId, spaceId)
  if (folder.parentId) throw new LibraryError("Pins live on a space, not a folder inside one", 400)
  return folder
}

export async function listPins(ownerId: string, spaceId: string): Promise<Pin[]> {
  await ownSpace(ownerId, spaceId)
  const rows = await db
    .select()
    .from(spacePins)
    .where(eq(spacePins.spaceId, spaceId))
    .orderBy(desc(spacePins.createdAt))
  return rows.map(view)
}

/**
 * Pins an answer to a space's wall (plan F52): a frozen snapshot of the run's question, its
 * verified answer and citations, so the wall never changes under it. Only a finished, verified
 * answer can be pinned; pinning it again returns the pin it already has.
 */
export async function pinAnswer(ownerId: string, spaceId: string, runId: string): Promise<Pin> {
  await ownSpace(ownerId, spaceId)
  const [row] = await db
    .select({
      id: messages.id,
      chatId: messages.chatId,
      parts: messages.parts,
      question: runs.question,
    })
    .from(messages)
    .innerJoin(runs, eq(runs.id, messages.runId))
    .where(
      and(eq(messages.runId, runId), eq(messages.ownerId, ownerId), eq(messages.role, "assistant")),
    )
    .limit(1)
  if (!row) throw new LibraryError("That answer isn't saved yet. Try again in a moment.", 404)
  const parts = row.parts as KonkyoMessage["parts"]
  const final = parts.find((p) => p.type === "data-final")
  if (final?.type !== "data-final")
    throw new LibraryError("Only a finished, checked answer can be pinned", 409)
  const receipt = parts.find((p) => p.type === "data-receipt")
  const citations = final.data.citations.map(
    (c: Citation): PinCitation => ({
      n: c.n,
      fileId: c.fileId,
      passageId: c.passageId,
      title: c.title,
      kind: c.kind,
      page: c.page,
      tStart: c.tStart,
      quote: c.quote,
    }),
  )
  await db
    .insert(spacePins)
    .values({
      spaceId,
      ownerId,
      messageId: row.id,
      chatId: row.chatId,
      question: row.question,
      body: final.data.body,
      citations,
      quotes:
        receipt?.type === "data-receipt" ? (receipt.data as Receipt).quotes : citations.length,
    })
    .onConflictDoNothing()
  const pin = await db.query.spacePins.findFirst({
    where: and(eq(spacePins.spaceId, spaceId), eq(spacePins.messageId, row.id)),
  })
  if (!pin) throw new LibraryError("Couldn't pin that answer", 500)
  return view(pin)
}

/** The pinner or the space's owner unpins (one and the same until spaces are shared). */
export async function unpin(ownerId: string, spaceId: string, pinId: string) {
  await ownSpace(ownerId, spaceId)
  await db.delete(spacePins).where(and(eq(spacePins.id, pinId), eq(spacePins.spaceId, spaceId)))
}

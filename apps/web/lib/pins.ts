import "server-only"
import type { Citation, KonkyoMessage, Receipt } from "@konkyo/agents"
import { db, schema } from "@konkyo/db"
import { type Role, spaceRole } from "@konkyo/db/access"
import { spaceEvent } from "@konkyo/db/live"
import type { PinCitation } from "@konkyo/db/schema"
import { and, desc, eq } from "drizzle-orm"
import { LibraryError } from "./library"

const { spacePins, messages, runs } = schema

export type Pin = {
  id: string
  question: string
  body: string
  citations: PinCitation[]
  quotes: number
  /** The pinner's chat: only they can open it. */
  chatId: string | null
  createdAt: string
  /** Pinned by me; who pinned it otherwise (a shared space). */
  mine: boolean
  by: string | null
  /** The pinner and the space's owner may unpin. */
  canUnpin: boolean
}

const view = (
  row: typeof spacePins.$inferSelect,
  viewer: { id: string; role: Role },
  by: string | null = null,
): Pin => {
  const mine = row.ownerId === viewer.id
  return {
    id: row.id,
    question: row.question,
    body: row.body,
    citations: row.citations,
    quotes: row.quotes,
    chatId: mine ? row.chatId : null,
    createdAt: row.createdAt.toISOString(),
    mine,
    by: mine ? null : by,
    canUnpin: mine || viewer.role === "owner",
  }
}

/** A space you're in: its owner and every member may see, add and remove their own pins. */
async function ownSpace(userId: string, spaceId: string) {
  const role = await spaceRole(userId, spaceId)
  if (!role) throw new LibraryError("No such space", 404)
  return role
}

export async function listPins(ownerId: string, spaceId: string): Promise<Pin[]> {
  const role = await ownSpace(ownerId, spaceId)
  const rows = await db
    .select({ pin: spacePins, by: schema.user.name })
    .from(spacePins)
    .leftJoin(schema.user, eq(schema.user.id, spacePins.ownerId))
    .where(eq(spacePins.spaceId, spaceId))
    .orderBy(desc(spacePins.createdAt))
  return rows.map((r) => view(r.pin, { id: ownerId, role }, r.by))
}

/**
 * Pins an answer to a space's wall: a frozen snapshot of the run's question, its
 * verified answer and citations, so the wall never changes under it. Only a finished, verified
 * answer can be pinned; pinning it again returns the pin it already has.
 */
export async function pinAnswer(ownerId: string, spaceId: string, runId: string): Promise<Pin> {
  const role = await ownSpace(ownerId, spaceId)
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
    .returning({ id: spacePins.id })
    .then(async ([made]) => {
      if (made)
        await spaceEvent(db, { spaceId, actorId: ownerId, kind: "pin_added", subjectId: made.id })
    })
  const pin = await db.query.spacePins.findFirst({
    where: and(eq(spacePins.spaceId, spaceId), eq(spacePins.messageId, row.id)),
  })
  if (!pin) throw new LibraryError("Couldn't pin that answer", 500)
  return view(pin, { id: ownerId, role })
}

/** The pinner or the space's owner unpins. */
export async function unpin(ownerId: string, spaceId: string, pinId: string) {
  const role = await ownSpace(ownerId, spaceId)
  const gone = await db
    .delete(spacePins)
    .where(
      and(
        eq(spacePins.id, pinId),
        eq(spacePins.spaceId, spaceId),
        role === "owner" ? undefined : eq(spacePins.ownerId, ownerId),
      ),
    )
    .returning({ id: spacePins.id })
  if (!gone.length)
    throw new LibraryError("Only whoever pinned it, or the space's owner, can unpin", 403)
  await spaceEvent(db, { spaceId, actorId: ownerId, kind: "pin_removed", subjectId: pinId })
}

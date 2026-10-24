import "server-only"
import { randomUUID } from "node:crypto"
import { type AnswerEvent, answer, Tracer } from "@konkyo/agents"
import { db, schema } from "@konkyo/db"
import { type Role, spaceRole } from "@konkyo/db/access"
import { notifyLive, spaceEvent } from "@konkyo/db/live"
import type { PinCitation, SpaceAnswerParts } from "@konkyo/db/schema"
import { and, desc, eq, isNull, sql } from "drizzle-orm"
import { after } from "next/server"
import { LibraryError } from "./library"
import { type Face, faceOf } from "./profiles"
import { endRun, registerRun, stopRun } from "./run-registry"
import { allowanceLeft } from "./usage"

const { spaceMessages, spacePins, user, profiles } = schema

/*
 * The space chat (plan F56): members talk in one thread; "@konkyo …" asks the space. Konkyo's
 * answer is one message everyone sees: its named steps as they happen (a signal on the live
 * channel, ids only), then the verified answer with its receipt. The asker or the owner can stop
 * it; anyone in the space can pin it.
 */

export const MESSAGE_MAX = 2000
/** "@konkyo" (any case), then the question. */
const ASK = /^@konkyo\b[\s,:]*/i
/** An answer still "answering" this long after it started lost its process (a restart). */
const STALE_MS = 5 * 60 * 1000
const PAGE = 80

export type SpaceMessage = {
  id: string
  kind: "text" | "ask" | "answer"
  body: string
  createdAt: string
  author: { name: string; face: Face } | null
  asker: string | null
  replyToId: string | null
  status: "answering" | "answered" | "not-found" | "failed" | "stopped" | null
  parts: SpaceAnswerParts | null
  mine: boolean
  canRemove: boolean
  canStop: boolean
  pinned: boolean
}

async function inSpace(userId: string, spaceId: string): Promise<Role> {
  const role = await spaceRole(userId, spaceId)
  if (!role) throw new LibraryError("No such space", 404)
  return role
}

/** The newest messages, oldest first, for anyone in the space. */
export async function listMessages(viewerId: string, spaceId: string): Promise<SpaceMessage[]> {
  const role = await inSpace(viewerId, spaceId)
  const asker = sql<
    string | null
  >`(select name from "user" a where a.id = ${spaceMessages.askerId})`
  const rows = await db
    .select({
      message: spaceMessages,
      person: user,
      profile: profiles,
      askerName: asker,
      pinned: sql<boolean>`exists (select 1 from space_pins p
        where p.space_id = ${spaceMessages.spaceId} and p.message_id = ${spaceMessages.id})`,
    })
    .from(spaceMessages)
    .leftJoin(user, eq(user.id, spaceMessages.authorId))
    .leftJoin(profiles, eq(profiles.userId, spaceMessages.authorId))
    .where(and(eq(spaceMessages.spaceId, spaceId), isNull(spaceMessages.deletedAt)))
    .orderBy(desc(spaceMessages.createdAt))
    .limit(PAGE)
  const now = Date.now()
  return rows.reverse().map(({ message: m, person, profile, askerName, pinned }) => {
    const lost = m.status === "answering" && now - m.createdAt.getTime() > STALE_MS
    const mine = m.authorId === viewerId || (m.kind === "answer" && m.askerId === viewerId)
    return {
      id: m.id,
      kind: m.kind,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      author: person ? { name: person.name, face: faceOf(person, profile) } : null,
      asker: askerName,
      replyToId: m.replyToId,
      status: lost ? "failed" : m.status,
      parts: m.parts,
      mine,
      canRemove: (m.authorId === viewerId || role === "owner") && m.kind !== "answer",
      canStop: m.status === "answering" && !lost && (m.askerId === viewerId || role === "owner"),
      pinned,
    }
  })
}

/**
 * Says something in the space. "@konkyo …" is an ask: the question goes in the thread, Konkyo's
 * answer is posted beside it at once ("answering") and made after the response, in this process.
 */
export async function postMessage(
  viewerId: string,
  spaceId: string,
  input: { id: string; body: string; replyToId?: string },
) {
  await inSpace(viewerId, spaceId)
  const body = input.body.trim().slice(0, MESSAGE_MAX)
  if (!body) throw new LibraryError("Say something first", 400)
  const question = ASK.test(body) ? body.replace(ASK, "").trim() : null
  if (question !== null && !question) throw new LibraryError("Ask @konkyo something", 400)
  if (question) {
    const limited = await allowanceLeft(viewerId, "questions")
    if (limited) throw new LibraryError(limited, 429)
  }
  // a reply is to a message in this same space
  if (input.replyToId) {
    const to = await db.query.spaceMessages.findFirst({
      where: and(eq(spaceMessages.id, input.replyToId), eq(spaceMessages.spaceId, spaceId)),
    })
    if (!to) throw new LibraryError("That message isn't in this space", 404)
  }
  const answerId = question ? randomUUID() : null
  await db.transaction(async (tx) => {
    const [made] = await tx
      .insert(spaceMessages)
      .values({
        id: input.id,
        spaceId,
        kind: question ? "ask" : "text",
        authorId: viewerId,
        body,
        replyToId: input.replyToId ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: spaceMessages.id })
    // the id is the client's (so a retry can't post twice): one that's taken is refused
    if (!made) throw new LibraryError("That message was already sent", 409)
    if (answerId)
      await tx.insert(spaceMessages).values({
        id: answerId,
        spaceId,
        kind: "answer",
        authorId: null,
        askerId: viewerId,
        body: "",
        replyToId: input.id,
        status: "answering",
        parts: { steps: [] },
      })
    await spaceEvent(tx, { spaceId, actorId: viewerId, kind: "message_added", subjectId: input.id })
  })
  if (question && answerId)
    after(() => runAnswer({ spaceId, askerId: viewerId, messageId: answerId, question }))
  return { id: input.id, answerId }
}

/** Konkyo answers in the thread: the space's sources, every check, steps announced as they go. */
async function runAnswer(input: {
  spaceId: string
  askerId: string
  messageId: string
  question: string
}) {
  const { spaceId, askerId, messageId, question } = input
  const runId = randomUUID()
  const tracer = new Tracer(runId)
  const signal = registerRun(runId, askerId)
  const parts: SpaceAnswerParts = { steps: [] }
  let saving: Promise<unknown> = Promise.resolve()
  // each named step is written and announced; the draft's words aren't (the answer posts once)
  const progress = () => {
    saving = saving.then(async () => {
      await db.update(spaceMessages).set({ parts, runId }).where(eq(spaceMessages.id, messageId))
      await notifyLive(`space:${spaceId}`, "answer_progress", { messageId })
    })
  }
  const emit = (event: AnswerEvent) => {
    if (event.type === "step") {
      const at = parts.steps.findIndex((s) => s.id === event.id)
      const step = { id: event.id, label: event.label, state: event.state }
      if (at === -1) parts.steps.push(step)
      else parts.steps[at] = step
      progress()
    } else if (event.type === "final") {
      parts.final = {
        body: event.body,
        caveat: event.caveat,
        citations: event.citations.map(
          (c): PinCitation => ({
            n: c.n,
            fileId: c.fileId,
            passageId: c.passageId,
            title: c.title,
            kind: c.kind,
            page: c.page,
            tStart: c.tStart,
            quote: c.quote,
          }),
        ),
      }
    } else if (event.type === "receipt") parts.quotes = event.receipt.quotes
    else if (event.type === "not-found") parts.notFound = true
  }
  let status: "answered" | "not-found" | "failed" | "stopped" = "failed"
  try {
    const result = await answer({
      ownerId: askerId,
      question,
      history: [],
      scope: { folderIds: [spaceId] },
      tracer,
      abortSignal: signal,
      emit,
      spaceId,
    })
    status = signal.aborted ? "stopped" : result.status === "answered" ? "answered" : result.status
  } catch (error) {
    status = signal.aborted ? "stopped" : "failed"
    if (!signal.aborted) console.error("[space chat]", error)
  } finally {
    endRun(runId)
    await saving.catch(() => undefined)
    await db.transaction(async (tx) => {
      await tx
        .update(spaceMessages)
        .set({ parts, status, runId, body: parts.final?.body ?? "" })
        .where(eq(spaceMessages.id, messageId))
      await spaceEvent(tx, {
        spaceId,
        actorId: askerId,
        kind: "message_updated",
        subjectId: messageId,
      })
    })
    await tracer.flush().catch(() => undefined)
  }
}

/** Stop Konkyo's answer: whoever asked, or the space's owner. */
export async function stopAnswer(viewerId: string, spaceId: string, messageId: string) {
  const role = await inSpace(viewerId, spaceId)
  const message = await db.query.spaceMessages.findFirst({
    where: and(eq(spaceMessages.id, messageId), eq(spaceMessages.spaceId, spaceId)),
  })
  if (message?.kind !== "answer" || message.status !== "answering")
    throw new LibraryError("That answer isn't running", 409)
  if (message.askerId !== viewerId && role !== "owner")
    throw new LibraryError("Only whoever asked, or the space's owner, can stop it", 403)
  // the run was registered to the asker; the owner stops it on their behalf
  if (!message.runId || !stopRun(message.runId, message.askerId ?? viewerId))
    await db.update(spaceMessages).set({ status: "stopped" }).where(eq(spaceMessages.id, messageId))
}

/** Take a message back (its author), or remove it (the space's owner). Konkyo's stay. */
export async function removeMessage(viewerId: string, spaceId: string, messageId: string) {
  const role = await inSpace(viewerId, spaceId)
  await db.transaction(async (tx) => {
    const [gone] = await tx
      .update(spaceMessages)
      .set({ deletedAt: sql`now()` })
      .where(
        and(
          eq(spaceMessages.id, messageId),
          eq(spaceMessages.spaceId, spaceId),
          isNull(spaceMessages.deletedAt),
          sql`${spaceMessages.kind} <> 'answer'`,
          role === "owner" ? undefined : eq(spaceMessages.authorId, viewerId),
        ),
      )
      .returning({ id: spaceMessages.id })
    if (!gone)
      throw new LibraryError("Only whoever wrote it, or the space's owner, can remove it", 403)
    await spaceEvent(tx, {
      spaceId,
      actorId: viewerId,
      kind: "message_removed",
      subjectId: messageId,
    })
  })
}

/** Pin Konkyo's answer from the thread to the wall (anyone in the space). */
export async function pinFromThread(viewerId: string, spaceId: string, messageId: string) {
  await inSpace(viewerId, spaceId)
  const message = await db.query.spaceMessages.findFirst({
    where: and(eq(spaceMessages.id, messageId), eq(spaceMessages.spaceId, spaceId)),
  })
  const final = message?.parts?.final
  if (message?.kind !== "answer" || message.status !== "answered" || !final)
    throw new LibraryError("Only a finished, checked answer can be pinned", 409)
  const ask = message.replyToId
    ? await db.query.spaceMessages.findFirst({
        where: and(eq(spaceMessages.id, message.replyToId), eq(spaceMessages.spaceId, spaceId)),
      })
    : undefined
  await db.transaction(async (tx) => {
    const [made] = await tx
      .insert(spacePins)
      .values({
        spaceId,
        ownerId: viewerId,
        messageId,
        chatId: null,
        question: ask?.body.replace(ASK, "").trim() || "A question in the space chat",
        body: final.body,
        citations: final.citations,
        quotes: message.parts?.quotes ?? final.citations.length,
      })
      .onConflictDoNothing()
      .returning({ id: spacePins.id })
    if (made)
      await spaceEvent(tx, { spaceId, actorId: viewerId, kind: "pin_added", subjectId: made.id })
  })
}

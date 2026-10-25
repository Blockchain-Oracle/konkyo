import "server-only"
import { randomUUID } from "node:crypto"
import {
  type KonkyoMessage,
  rateRecalled,
  recordCorrection,
  recordWrongPassage,
} from "@konkyo/agents"
import { LIMITS } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import type { ChatScope } from "@konkyo/db/schema"
import { and, asc, count, desc, eq, gt, gte, isNull, lt, sql } from "drizzle-orm"
import { clock } from "@/lib/format"
import { LibraryError } from "./library"
import { allowanceLeft } from "./usage"

const { chats, messages, runs } = schema

/** A first question becomes the chat's title, cut at a word (plan F17 rename can change it). */
function titleFrom(question: string) {
  const clean = question.replace(/\s+/g, " ").trim()
  if (clean.length <= 64) return clean
  return `${clean.slice(0, 64).replace(/\s+\S*$/, "")}…`
}

const sameScope = (a: ChatScope, b: ChatScope) => {
  const key = (s: ChatScope) =>
    JSON.stringify([[...(s.fileIds ?? [])].sort(), [...(s.folderIds ?? [])].sort()])
  return key(a) === key(b)
}

/**
 * The chat for this id, created on its first message; another person's chat is refused. Each
 * question carries the composer's focus, so a focus changed mid-chat is kept for the next visit.
 */
export async function ensureChat(
  ownerId: string,
  chatId: string,
  question: string,
  scope?: ChatScope,
) {
  await db
    .insert(chats)
    .values({ id: chatId, ownerId, title: titleFrom(question), scope: scope ?? {} })
    .onConflictDoNothing()
  const chat = await db.query.chats.findFirst({ where: eq(chats.id, chatId) })
  if (!chat || chat.ownerId !== ownerId || chat.deletedAt)
    throw new LibraryError("No such chat", 404)
  if (scope && !sameScope(scope, chat.scope)) {
    await db.update(chats).set({ scope }).where(eq(chats.id, chatId))
    chat.scope = scope
  }
  return chat
}

type Turn = { role: "user" | "assistant"; text: string }

/** When a message was saved, if it has been (a regenerated question already has). */
async function savedAt(chatId: string, messageId: string) {
  const row = await db.query.messages.findFirst({
    columns: { createdAt: true },
    where: and(eq(messages.chatId, chatId), eq(messages.id, messageId)),
  })
  return row?.createdAt
}

/**
 * Earlier turns as plain text for the Planner: questions, and verified answers without markers.
 * Only what came before `beforeMessageId`, so a regenerated answer doesn't see the one it replaces.
 */
export async function historyFor(chatId: string, beforeMessageId: string): Promise<Turn[]> {
  const before = await savedAt(chatId, beforeMessageId)
  const rows = await db
    .select({ role: messages.role, parts: messages.parts })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), before ? lt(messages.createdAt, before) : undefined))
    .orderBy(asc(messages.createdAt))
  return rows.flatMap((m): Turn[] => {
    const parts = m.parts as KonkyoMessage["parts"]
    if (m.role === "user") {
      const text = parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join(" ")
      return text ? [{ role: "user", text }] : []
    }
    const final = parts.find((p) => p.type === "data-final")
    if (final?.type === "data-final")
      return [{ role: "assistant", text: final.data.body.replace(/\[\d+\]/g, "") }]
    if (parts.some((p) => p.type === "data-notFound"))
      return [{ role: "assistant", text: "(The library did not cover that question.)" }]
    return []
  })
}

export async function saveMessage(
  ownerId: string,
  chatId: string,
  message: KonkyoMessage,
  runId?: string,
) {
  await db
    .insert(messages)
    .values({
      id: message.id,
      chatId,
      ownerId,
      role: message.role === "user" ? "user" : "assistant",
      parts: message.parts,
      runId,
    })
    .onConflictDoUpdate({ target: messages.id, set: { parts: message.parts } })
  await db.update(chats).set({ updatedAt: new Date() }).where(eq(chats.id, chatId))
}

/** Regenerate: the answers after this question go, and a new one is written in their place. */
export async function dropAfter(chatId: string, messageId: string) {
  const at = await savedAt(chatId, messageId)
  if (at)
    await db.delete(messages).where(and(eq(messages.chatId, chatId), gt(messages.createdAt, at)))
}

/**
 * Whether this person may ask now (plan §3 rate limits): a cap per ten minutes and per day, lower
 * for guests. Returns the reason in plain words when they can't.
 */
export async function answerLimit(ownerId: string): Promise<string | null> {
  const [recent] = await db
    .select({ n: count() })
    .from(runs)
    .where(and(eq(runs.ownerId, ownerId), gte(runs.createdAt, new Date(Date.now() - 10 * 60_000))))
  if ((recent?.n ?? 0) >= LIMITS.answersPerTenMinutes)
    return "That's a lot of questions in a few minutes. Try again shortly."
  return allowanceLeft(ownerId, "questions")
}

export async function startRun(ownerId: string, chatId: string, runId: string, question: string) {
  await db.insert(runs).values({ id: runId, chatId, ownerId, question, status: "running" })
}

export async function finishRun(
  runId: string,
  outcome: {
    status: "answered" | "not-found" | "failed" | "stopped"
    receipt?: unknown
    events: unknown[]
  },
) {
  await db
    .update(runs)
    .set({ ...outcome, finishedAt: new Date() })
    .where(eq(runs.id, runId))
}

/** The sidebar's and Chats page's list (plan F17): pinned first, then most recent. */
export async function listChats(ownerId: string) {
  return db
    .select({
      id: chats.id,
      title: chats.title,
      pinnedAt: chats.pinnedAt,
      updatedAt: chats.updatedAt,
      // the space its first folder belongs to: the list groups chats by space
      space: sql<{ id: string; name: string; color: string | null } | null>`(
        select json_build_object('id', s.id, 'name', s.name, 'color', s.color)
        from folders fo join folders s on s.id = fo.space_id
        where fo.id = (${chats.scope}->'folderIds'->>0)::uuid and s.deleted_at is null)`,
    })
    .from(chats)
    .where(and(eq(chats.ownerId, ownerId), isNull(chats.deletedAt)))
    .orderBy(desc(chats.pinnedAt), desc(chats.updatedAt))
    .limit(200)
}

export async function getChat(ownerId: string, chatId: string) {
  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.ownerId, ownerId), isNull(chats.deletedAt)),
  })
  if (!chat) return null
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt))
  return {
    chat: { id: chat.id, title: chat.title, scope: chat.scope, pinnedAt: chat.pinnedAt },
    messages: rows.map(
      (m) =>
        ({
          id: m.id,
          role: m.role,
          parts: m.parts,
          metadata: {
            runId: m.runId ?? undefined,
            createdAt: m.createdAt.toISOString(),
            feedback: m.feedback ?? undefined,
          },
        }) as KonkyoMessage,
    ),
  }
}

async function ownChat(ownerId: string, chatId: string) {
  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.ownerId, ownerId), isNull(chats.deletedAt)),
  })
  if (!chat) throw new LibraryError("No such chat", 404)
  return chat
}

/** Rename or pin a chat (plan F17). */
export async function editChat(
  ownerId: string,
  chatId: string,
  edit: { title?: string; pinned?: boolean },
) {
  await ownChat(ownerId, chatId)
  const title = edit.title?.replace(/\s+/g, " ").trim()
  await db
    .update(chats)
    .set({
      ...(title ? { title: title.slice(0, 200) } : {}),
      ...(edit.pinned != null ? { pinnedAt: edit.pinned ? new Date() : null } : {}),
    })
    .where(eq(chats.id, chatId))
}

/** To Trash with its messages (restorable for 30 days, like files). */
export async function trashChat(ownerId: string, chatId: string) {
  await ownChat(ownerId, chatId)
  const batch = randomUUID()
  await db
    .update(chats)
    .set({ deletedAt: new Date(), trashBatch: batch })
    .where(eq(chats.id, chatId))
  return { batch }
}

export type Rating = { rating: "up" | "down" | null; reason?: string; note?: string }

/**
 * 👍 / 👎 on an answer (plan F17, §2 Memory). Every rating reaches the H-MEM memories that shaped
 * the answer (their confidence goes up or down); a 👎 with a reason becomes a new correction the
 * Planner and Writer read next time a similar question comes up.
 */
export async function rateMessage(ownerId: string, messageId: string, input: Rating) {
  const message = await db.query.messages.findFirst({
    where: and(eq(messages.id, messageId), eq(messages.ownerId, ownerId)),
  })
  if (message?.role !== "assistant") throw new LibraryError("No such answer", 404)
  const run = message.runId
    ? await db.query.runs.findFirst({ where: eq(runs.id, message.runId) })
    : undefined
  const note =
    input.rating === "down" ? [input.reason, input.note?.trim()].filter(Boolean).join(": ") : null
  await db
    .update(messages)
    .set({ feedback: input.rating, feedbackNote: note || null })
    .where(eq(messages.id, messageId))
  if (!input.rating) return { remembered: false }

  const used = ((run?.receipt as { memories?: { id: string }[] } | null)?.memories ?? []).map(
    (m) => m.id,
  )
  rateRecalled(ownerId, used, input.rating === "up")
  if (input.rating === "down" && input.reason && run) {
    recordCorrection(ownerId, {
      question: run.question,
      reason: input.reason,
      note: input.note,
      chatId: message.chatId,
      messageId,
    })
    return { remembered: true }
  }
  return { remembered: false }
}

/**
 * "Right passage?" on a cited passage (plan F11, F33). A 👎 becomes a correction the Writer reads
 * before citing for a similar question again; a 👍 needs nothing remembered.
 */
export async function rateCitation(ownerId: string, messageId: string, n: number, right: boolean) {
  const message = await db.query.messages.findFirst({
    where: and(eq(messages.id, messageId), eq(messages.ownerId, ownerId)),
  })
  if (message?.role !== "assistant") throw new LibraryError("No such answer", 404)
  const final = (message.parts as KonkyoMessage["parts"]).find((p) => p.type === "data-final")
  const citation = final?.type === "data-final" ? final.data.citations.find((c) => c.n === n) : null
  if (!citation) throw new LibraryError("No such citation", 404)
  if (right) return { remembered: false }
  const run = message.runId
    ? await db.query.runs.findFirst({ where: eq(runs.id, message.runId) })
    : undefined
  recordWrongPassage(ownerId, {
    question: run?.question ?? "this question",
    title: citation.title,
    where:
      citation.page != null
        ? `p. ${citation.page}`
        : citation.tStart != null
          ? clock(citation.tStart)
          : "",
    quote: citation.quote,
    chatId: message.chatId,
    messageId,
  })
  return { remembered: true }
}

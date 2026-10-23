import "server-only"
import type { KonkyoMessage } from "@konkyo/agents"
import { db, schema } from "@konkyo/db"
import type { ChatScope } from "@konkyo/db/schema"
import { and, asc, desc, eq, isNull } from "drizzle-orm"
import { LibraryError } from "./library"

const { chats, messages, runs } = schema

/** A first question becomes the chat's title, cut at a word (plan F17 rename can change it). */
function titleFrom(question: string) {
  const clean = question.replace(/\s+/g, " ").trim()
  if (clean.length <= 64) return clean
  return `${clean.slice(0, 64).replace(/\s+\S*$/, "")}…`
}

/** The chat for this id, created on its first message; another person's chat is refused. */
export async function ensureChat(
  ownerId: string,
  chatId: string,
  question: string,
  scope: ChatScope,
) {
  await db
    .insert(chats)
    .values({ id: chatId, ownerId, title: titleFrom(question), scope })
    .onConflictDoNothing()
  const chat = await db.query.chats.findFirst({ where: eq(chats.id, chatId) })
  if (!chat || chat.ownerId !== ownerId || chat.deletedAt)
    throw new LibraryError("No such chat", 404)
  return chat
}

type Turn = { role: "user" | "assistant"; text: string }

/** Earlier turns as plain text for the Planner: questions, and verified answers without markers. */
export async function historyFor(chatId: string): Promise<Turn[]> {
  const rows = await db
    .select({ role: messages.role, parts: messages.parts })
    .from(messages)
    .where(eq(messages.chatId, chatId))
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
          metadata: { runId: m.runId ?? undefined, createdAt: m.createdAt.toISOString() },
        }) as KonkyoMessage,
    ),
  }
}

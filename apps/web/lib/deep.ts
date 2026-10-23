import "server-only"
import { randomUUID } from "node:crypto"
import type { DeepEvent, KonkyoMessage } from "@konkyo/agents"
import { LIMITS } from "@konkyo/config"
import { db, pg, schema } from "@konkyo/db"
import type { ChatScope } from "@konkyo/db/schema"
import { enqueue } from "@konkyo/jobs"
import { and, asc, count, eq, gt, gte } from "drizzle-orm"
import { ensureChat, saveMessage } from "./chats"
import { LibraryError } from "./library"

const { runs, runEvents, messages, userSettings } = schema

/** The web app's side of a deep run's event log (Stop, Steer); the worker writes the rest. */
async function emit(runId: string, event: DeepEvent) {
  await db.insert(runEvents).values({ runId, type: event.type, data: event })
  await pg.notify("run_events", runId)
}

async function ownRun(ownerId: string, runId: string) {
  const run = await db.query.runs.findFirst({
    where: and(eq(runs.id, runId), eq(runs.ownerId, ownerId), eq(runs.kind, "deep")),
  })
  if (!run) throw new LibraryError("No such search", 404)
  return run
}

const ACTIVE = new Set(["queued", "searching", "awaiting", "importing", "answering"])

/**
 * Starts a deep search (plan F18) in a chat: from "Find sources" on an answer the library
 * couldn't give, or a question asked with Deep search on. The run lives in the worker; this
 * saves the message that shows it and returns it for the chat to add.
 */
export async function startDeep(
  ownerId: string,
  guest: boolean,
  input: {
    chatId: string
    question: string
    userMessage?: KonkyoMessage
    scope?: ChatScope
    /** "Find sources on this topic" in a folder: what's found goes into that folder. */
    intoFolderId?: string
  },
) {
  const [today] = await db
    .select({ n: count() })
    .from(runs)
    .where(
      and(
        eq(runs.ownerId, ownerId),
        eq(runs.kind, "deep"),
        gte(runs.createdAt, new Date(Date.now() - 86_400_000)),
      ),
    )
  const perDay = guest ? LIMITS.guestDeepSearchesPerDay : LIMITS.deepSearchesPerDay
  if ((today?.n ?? 0) >= perDay)
    throw new LibraryError(
      guest
        ? `Guests can run ${perDay} deep searches a day. Continue with Google for more.`
        : "You've run today's deep searches. More tomorrow.",
      429,
    )

  await ensureChat(ownerId, input.chatId, input.question, input.scope)
  if (input.userMessage) await saveMessage(ownerId, input.chatId, input.userMessage)
  const runId = randomUUID()
  const message: KonkyoMessage = {
    id: randomUUID(),
    role: "assistant",
    parts: [{ type: "data-deep", id: "deep", data: { runId, question: input.question } }],
    metadata: { runId, createdAt: new Date().toISOString() },
  }
  // The run row first: the message points at it.
  await db.insert(runs).values({
    id: runId,
    chatId: input.chatId,
    ownerId,
    question: input.question,
    kind: "deep",
    status: "queued",
    messageId: message.id,
    state: input.intoFolderId ? { intoFolderId: input.intoFolderId } : {},
  })
  await saveMessage(ownerId, input.chatId, message, runId)
  await enqueue("deep", { runId, phase: "search" }, `${runId}:search`)
  return { runId, message }
}

/** The person's choice of what to import (F18); "always" turns asking off for next time. */
export async function approveDeep(
  ownerId: string,
  runId: string,
  input: { keys: string[]; folderName: string; always?: boolean },
) {
  const run = await ownRun(ownerId, runId)
  if (run.status !== "awaiting") throw new LibraryError("This search isn't waiting for you", 409)
  const state = (run.state ?? {}) as { candidates?: { key: string }[] }
  const known = new Set((state.candidates ?? []).map((c) => c.key))
  const keys = input.keys.filter((k) => known.has(k))
  if (!keys.length) throw new LibraryError("Choose at least one source")
  await db
    .update(runs)
    .set({
      status: "importing",
      state: { ...state, approved: { keys, folderName: input.folderName.trim().slice(0, 80) } },
    })
    .where(eq(runs.id, runId))
  if (input.always)
    await db
      .insert(userSettings)
      .values({ userId: ownerId, autoImportSources: true })
      .onConflictDoUpdate({ target: userSettings.userId, set: { autoImportSources: true } })
  await enqueue("deep", { runId, phase: "import" }, `${runId}:import`)
}

/** Stop (F19): the worker checks between steps; the run view hears it at once. */
export async function stopDeep(ownerId: string, runId: string) {
  const run = await ownRun(ownerId, runId)
  if (!ACTIVE.has(run.status)) return false
  await db.update(runs).set({ status: "stopped", finishedAt: new Date() }).where(eq(runs.id, runId))
  await emit(runId, { type: "end", status: "stopped", message: "Stopped." })
  return true
}

/** Steer (F19): a direction added mid-run, read before screening and before answering. */
export async function steerDeep(ownerId: string, runId: string, text: string) {
  const run = await ownRun(ownerId, runId)
  if (!ACTIVE.has(run.status)) throw new LibraryError("This search has finished", 409)
  const state = (run.state ?? {}) as { steer?: string[] }
  await db
    .update(runs)
    .set({ state: { ...state, steer: [...(state.steer ?? []), text] } })
    .where(eq(runs.id, runId))
  await emit(runId, { type: "steer", text })
}

/** Events after the given id, oldest first (the SSE replay). */
export async function eventsAfter(runId: string, after: number) {
  return db
    .select({ id: runEvents.id, data: runEvents.data })
    .from(runEvents)
    .where(and(eq(runEvents.runId, runId), gt(runEvents.id, after)))
    .orderBy(asc(runEvents.id))
    .limit(500)
}

export async function deepRunFor(ownerId: string, runId: string) {
  return ownRun(ownerId, runId)
}

/** The saved message of a finished run (the chat swaps it in when the stream ends). */
export async function deepMessage(ownerId: string, runId: string) {
  const run = await ownRun(ownerId, runId)
  if (!run.messageId) return null
  const row = await db.query.messages.findFirst({ where: eq(messages.id, run.messageId) })
  return row
    ? ({
        id: row.id,
        role: "assistant",
        parts: row.parts,
        metadata: {
          runId,
          createdAt: row.createdAt.toISOString(),
          feedback: row.feedback ?? undefined,
        },
      } as KonkyoMessage)
    : null
}

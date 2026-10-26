import { rm } from "node:fs/promises"
import path from "node:path"
import { embed, HMEM, type MemoryRecord } from "@konkyo/meterless/hmem"
import { taped } from "@konkyo/tape"
import { freshCache } from "./fresh"
import { embedQueries } from "./retrieve"

/**
 * Each person's corrections memory, on Meterless H-MEM as published:
 * its own file persistence (state.json + ledger.jsonl per person) and trust ledger. A 👎 with a
 * reason becomes a `user_correction` memory; the Planner and Writer read the relevant ones on
 * every run, and feedback on an answer adjusts the confidence of the memories it used.
 */
const MEMORY_DIR =
  process.env.KONKYO_MEMORY_DIR ??
  path.resolve(process.env.KONKYO_ROOT ?? process.cwd(), ".data", "memory")

/** User ids are Better Auth ids; anything else never becomes a path. */
const safeId = (userId: string) => userId.replace(/[^A-Za-z0-9_-]/g, "")

const cached = freshCache<HMEM>("__konkyoMemory")

/** One instance per person, rebuilt when another process (web, worker) changed its file. */
export function memoryFor(userId: string): HMEM {
  const dir = path.join(MEMORY_DIR, safeId(userId))
  return cached(
    dir,
    path.join(dir, "state.json"),
    () => new HMEM({ persistDir: dir, actor: "konkyo" }),
  )
}

export type Recalled = { id: string; content: string; relevance: number }

/**
 * Below this cosine (Nemotron Embed, both as queries), a memory is about something else.
 * Measured testing: related questions scored 0.54–0.68 against a correction, unrelated ones
 * 0.00–0.20.
 */
const MIN_MEANING = 0.35

const cosine = (a: number[], b: number[]) => {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] as number) * (b[i] as number)
    na += (a[i] as number) ** 2
    nb += (b[i] as number) ** 2
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

/**
 * Memories relevant to a question. H-MEM ranks them (its hybrid score, logged to its ledger as
 * reads) with a looser threshold, then the same embeddings the library uses keep only those
 * about the same thing: H-MEM's built-in embedder hashes words, so "memory" in two unrelated
 * questions looks alike to it.
 */
export const recall = taped(
  "memory.recall",
  recallFor,
  (_userId: string, question: string, topN?: number) => [question, topN],
)

async function recallFor(userId: string, question: string, topN = 3): Promise<Recalled[]> {
  const { memories } = memoryFor(userId).query(question, { topN: 8, threshold: 0.25 })
  if (!memories.length) return []
  const [q, ...vectors] = await embedQueries([question, ...memories.map((m) => m.memory.content)])
  return memories
    .map((m, i) => ({
      id: m.memory.id,
      content: m.memory.content,
      relevance: m.relevance,
      meaning: cosine(q as number[], vectors[i] as number[]),
    }))
    .filter((m) => m.meaning >= MIN_MEANING)
    .sort((a, b) => b.meaning - a.meaning)
    .slice(0, topN)
    .map(({ id, content, relevance }) => ({ id, content, relevance }))
}

/** A 👎 with a reason: what the person said was wrong, kept with where it came from. */
export function recordCorrection(
  userId: string,
  input: { question: string; reason: string; note?: string; chatId: string; messageId: string },
): MemoryRecord {
  const note = input.note?.trim().replace(/[.\s]+$/, "")
  return memoryFor(userId).add({
    content: `About “${input.question}”: an earlier answer was marked “${input.reason}”${note ? `. The person said: ${note}` : ""}.`,
    type: "factual",
    layer: "working",
    tags: ["correction", input.reason.toLowerCase().replace(/\s+/g, "-")],
    confidence: 0.8,
    source: `chat:${input.chatId}`,
    provenance: {
      origin: "user_correction",
      learnedAt: Date.now(),
      label: "Thumbs down on an answer",
      refs: [input.messageId],
    },
    chatId: input.chatId,
  })
}

/** "Tell it something" on the knows page: a line the person wrote themselves. */
export function tellMemory(userId: string, content: string): MemoryRecord {
  return memoryFor(userId).add({
    content: content.replace(/\s+/g, " ").trim(),
    type: "factual",
    layer: "working",
    tags: ["told"],
    confidence: 0.9,
    source: "knows",
    provenance: {
      origin: "user_correction",
      learnedAt: Date.now(),
      label: "Told on the knows page",
      refs: [],
    },
  })
}

/** 👎 on a cited passage ("Right passage?"): that passage didn't support the answer. */
export function recordWrongPassage(
  userId: string,
  input: {
    question: string
    title: string
    where: string
    quote: string
    chatId: string
    messageId: string
  },
): MemoryRecord {
  return memoryFor(userId).add({
    content: `About “${input.question}”: the person said “${input.title}”${input.where ? ` (${input.where})` : ""} was the wrong passage to cite (it was cited for “${input.quote}”).`,
    type: "factual",
    layer: "working",
    tags: ["correction", "wrong-passage"],
    confidence: 0.8,
    source: `chat:${input.chatId}`,
    provenance: {
      origin: "user_correction",
      learnedAt: Date.now(),
      label: "Thumbs down on a cited passage",
      refs: [input.messageId],
    },
    chatId: input.chatId,
  })
}

/**
 * "This is wrong" on a practice item (F27) that the Verifier agreed was wrong: the Tutor reads it
 * before making practice from the same material again.
 */
export function recordWrongItem(
  userId: string,
  input: { title: string; question: string; answer: string; reason?: string; itemId: string },
): MemoryRecord {
  const reason = input.reason?.trim().replace(/[.\s]+$/, "")
  return memoryFor(userId).add({
    content: `A practice item from “${input.title}” was wrong: “${input.question}” with the answer “${input.answer}”${reason ? `. The person said: ${reason}` : ""}.`,
    type: "factual",
    layer: "working",
    tags: ["correction", "wrong-item"],
    confidence: 0.8,
    source: `study:${input.itemId}`,
    provenance: {
      origin: "user_correction",
      learnedAt: Date.now(),
      label: "This is wrong, on a practice item",
      refs: [input.itemId],
    },
  })
}

/** 👍 / 👎 on an answer reaches the memories that shaped it (H-MEM feedback deltas). */
export function rateRecalled(userId: string, memoryIds: string[], helpful: boolean) {
  const memory = memoryFor(userId)
  // A memory forgotten since the answer was written has nothing left to rate.
  for (const id of memoryIds)
    if (memory.store.get(id)) memory.feedback(id, helpful ? "helpful" : "wrong")
}

/** Forget one memory (the Memory page). H-MEM keeps the deletion in its trust ledger. */
export function forget(userId: string, memoryId: string) {
  const memory = memoryFor(userId)
  if (!memory.store.get(memoryId)) return false
  memory.store.delete(memoryId, "Forgotten by the person")
  return true
}

/** The person rewrote a memory in their own words (the Memory page); recall follows the new text. */
export function editMemory(userId: string, memoryId: string, content: string) {
  const memory = memoryFor(userId)
  if (!memory.store.get(memoryId)) return false
  memory.store.update(memoryId, {
    content,
    embedding: embed(content),
    entities: memory.store.extractEntities(content),
    confidence: 0.9,
  })
  return true
}

/** Forget everything (the Memory page's Forget all); each deletion is kept in the ledger. */
export function forgetAll(userId: string) {
  const memory = memoryFor(userId)
  for (const m of memory.store.all()) memory.store.delete(m.id, "Forget all, by the person")
}

/** Deletes a person's memory files, ledger included (account deletion; nothing is kept). */
export async function deleteMemoryOf(userId: string) {
  await rm(path.join(MEMORY_DIR, safeId(userId)), { recursive: true, force: true })
}

/**
 * A guest who signs in with Google keeps their corrections (F43): reownUserData moves rows, and
 * these live on disk under the guest's id, so each is copied to the account, then the guest's go.
 */
export async function moveMemory(fromUserId: string, toUserId: string) {
  if (fromUserId === toUserId) return
  const to = memoryFor(toUserId)
  for (const m of memoryFor(fromUserId).store.all())
    if (!m.supersededBy)
      to.add({
        content: m.content,
        type: m.type,
        layer: m.layer,
        tags: m.tags,
        confidence: m.confidence,
        source: m.source,
        provenance: m.provenance,
        chatId: m.chatId,
      })
  await deleteMemoryOf(fromUserId)
}

/** Everything remembered, newest first (the Memory page). */
export function listMemories(userId: string) {
  return memoryFor(userId)
    .store.all()
    .filter((m) => !m.supersededBy)
    .sort((a, b) => b.timestamp - a.timestamp)
    .map((m) => ({
      id: m.id,
      content: m.content,
      learnedAt: m.provenance.learnedAt,
      origin: m.provenance.origin,
      confidence: m.confidence,
      recalled: m.accessCount,
      chatId: m.chatId ?? null,
    }))
}

export type MemoryItem = ReturnType<typeof listMemories>[number]

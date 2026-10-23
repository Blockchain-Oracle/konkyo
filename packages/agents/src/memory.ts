import path from "node:path"
import { embed, HMEM, type MemoryRecord } from "@konkyo/meterless/hmem"

/**
 * Each person's corrections memory (plan §2 "Memory", F33), on Meterless H-MEM as published:
 * its own file persistence (state.json + ledger.jsonl per person) and trust ledger. A 👎 with a
 * reason becomes a `user_correction` memory; the Planner and Writer read the relevant ones on
 * every run, and feedback on an answer adjusts the confidence of the memories it used.
 */
const MEMORY_DIR =
  process.env.KONKYO_MEMORY_DIR ??
  path.resolve(process.env.KONKYO_ROOT ?? process.cwd(), ".data", "memory")

// One instance per person for the whole server process: Next can load this module in more than
// one bundle (route handlers, pages), and two caches would each hold their own copy of the file.
const store = globalThis as typeof globalThis & { __konkyoMemory?: Map<string, HMEM> }
store.__konkyoMemory ??= new Map()
const instances = store.__konkyoMemory

/** User ids are Better Auth ids; anything else never becomes a path. */
const safeId = (userId: string) => userId.replace(/[^A-Za-z0-9_-]/g, "")

export function memoryFor(userId: string): HMEM {
  const id = safeId(userId)
  let memory = instances.get(id)
  if (!memory) {
    memory = new HMEM({ persistDir: path.join(MEMORY_DIR, id), actor: "konkyo" })
    instances.set(id, memory)
  }
  return memory
}

export type Recalled = { id: string; content: string; relevance: number }

/** Memories relevant to a question (H-MEM retrieval, logged to its ledger as reads). */
export function recall(userId: string, question: string, topN = 3): Recalled[] {
  const { memories } = memoryFor(userId).query(question, { topN })
  return memories.map((m) => ({
    id: m.memory.id,
    content: m.memory.content,
    relevance: m.relevance,
  }))
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

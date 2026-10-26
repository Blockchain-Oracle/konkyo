import { createHash } from "node:crypto"
import { db, schema } from "@konkyo/db"
import { reachSql, resolveReach } from "@konkyo/db/access"
import { generateText, Output } from "ai"
import { and, desc, eq, isNull, sql } from "drizzle-orm"
import { z } from "zod"
import { MODELS, model, ordered, reasoning } from "./models"
import type { Scope } from "./retrieve"

const { files } = schema

const Suggested = z.object({
  questions: z.array(z.string()).min(1).max(4),
})

type Cached = { at: number; questions: string[] }
const cache = globalThis as typeof globalThis & { __konkyoSuggest?: Map<string, Cached> }
cache.__konkyoSuggest ??= new Map()
const TTL_MS = 6 * 60 * 60 * 1000

/**
 * Questions worth asking of what's in focus (plan F16), written from the files' own summaries,
 * so each one is something those files can answer. The whole library uses its newest files.
 * Cached per set of files until one of them changes.
 */
export async function suggestQuestions(ownerId: string, scope: Scope): Promise<string[]> {
  // In a space, everyone's sources there (access.ts); elsewhere, only mine.
  const reach = await resolveReach(ownerId, scope)
  const rows = await db
    .select({ id: files.id, title: files.title, meta: files.meta, updatedAt: files.updatedAt })
    .from(files)
    .where(
      and(
        sql`${reachSql(reach, "files", "id")}`,
        eq(files.status, "ready"),
        isNull(files.deletedAt),
      ),
    )
    .orderBy(desc(files.createdAt))
    .limit(8)
  if (!rows.length) return []

  const key = createHash("sha256")
    .update(rows.map((r) => `${r.id}:${r.updatedAt.toISOString()}`).join("|"))
    .digest("hex")
  const hit = cache.__konkyoSuggest?.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.questions

  const described = rows
    .map((r) => `- ${r.title}${r.meta?.summary ? `: ${r.meta.summary}` : ""}`)
    .join("\n")
  const choice = ordered(MODELS.writer).primary
  const { output } = await generateText({
    model: model(choice),
    providerOptions: reasoning(choice),
    output: Output.object({ schema: Suggested }),
    instructions: `You suggest questions a student or researcher could ask about their own files. Write ${
      rows.length > 1 ? "4" : "3"
    } short questions (at most 12 words each), each one these files can answer from what their descriptions show. ${
      rows.length > 1
        ? "Make one compare or connect two of the files. Mix a specific finding, a method or definition, and an implication."
        : "Mix a specific finding, a method or definition, and an implication."
    } Ask open questions (what, how, why, do they agree) that never presume a result the descriptions don't state. Refer to files by their topic, never by their title. Plain words, no numbering.`,
    prompt: `Files:\n${described}`,
    abortSignal: AbortSignal.timeout(20_000),
  })
  const questions = output.questions.map((q) => q.trim()).filter(Boolean)
  cache.__konkyoSuggest?.set(key, { at: Date.now(), questions })
  return questions
}

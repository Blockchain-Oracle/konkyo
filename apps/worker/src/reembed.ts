import { db, schema } from "@konkyo/db"
import { and, asc, eq, gt, isNull } from "drizzle-orm"
import { embed } from "./pipeline"

const { passages } = schema

/** Passages per round: ten embedding requests, each its own cache lookup. */
const ROUND = 960
const FIRST_ID = "00000000-0000-0000-0000-000000000000"

/**
 * Every passage without a vector gets one: after the move to Nemotron's embeddings (migration
 * 0036) that is all of them, once. Walks the table by id so a passage that fails is passed over
 * rather than retried forever; runs at start-up, beside the queues.
 */
export async function reembedMissing(): Promise<{ embedded: number; tokens: number }> {
  let after = FIRST_ID
  let embedded = 0
  let tokens = 0
  for (;;) {
    const rows = await db
      .select({ id: passages.id, text: passages.text })
      .from(passages)
      .where(and(isNull(passages.embedding), gt(passages.id, after)))
      .orderBy(asc(passages.id))
      .limit(ROUND)
    if (!rows.length) return { embedded, tokens }
    after = (rows.at(-1) as { id: string }).id
    const vectors: { text: string; embedding?: number[] | null }[] = rows.map((r) => ({
      text: r.text,
    }))
    tokens += await embed(vectors)
    await db.transaction(async (tx) => {
      for (const [i, row] of rows.entries()) {
        const embedding = vectors[i]?.embedding
        if (embedding) await tx.update(passages).set({ embedding }).where(eq(passages.id, row.id))
      }
    })
    embedded += rows.length
  }
}

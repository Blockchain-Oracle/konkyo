import { createHash } from "node:crypto"
import { INGEST } from "@konkyo/config"
import { env } from "@konkyo/env/server"
import { tapedFetch } from "@konkyo/tape"
import { limiterFor } from "./limiter"
import { baseURL } from "./provider"

/**
 * Nemotron embeds a question and a passage differently (it's asymmetric): passages when a file is
 * indexed, queries when someone asks. Mixing them up costs a lot of retrieval accuracy.
 */
export type EmbedAs = "query" | "passage"

/** Cache key: the same text, model, width and role is never embedded twice. */
export const embeddingKey = (text: string, as: EmbedAs) =>
  createHash("sha256")
    .update(`${INGEST.embeddingModel}\n${INGEST.embeddingDimensions}\n${as}\n${text}`)
    .digest("hex")

const TIMEOUT_MS = 30_000
const RETRIES = 3
const BACKOFF_MS = 2_000

type Reply = { data: { embedding: number[]; index: number }[]; usage?: { total_tokens?: number } }

/** One request; a rate limit or a server error waits (Retry-After when given) and tries again. */
async function request(input: string[], as: EmbedAs): Promise<Reply> {
  for (let attempt = 0; ; attempt++) {
    const res = await limiterFor(INGEST.embeddingModel).run(() =>
      tapedFetch(`${baseURL}/embeddings`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.NVIDIA_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: INGEST.embeddingModel,
          input,
          input_type: as,
          dimensions: INGEST.embeddingDimensions,
          truncate: "END",
          encoding_format: "float",
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }),
    )
    if (res.ok) return (await res.json()) as Reply
    const retryable = res.status === 429 || res.status >= 500
    if (!retryable || attempt >= RETRIES) {
      throw new Error(`Embedding failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
    }
    const after = Number(res.headers.get("retry-after"))
    await new Promise((resolve) =>
      setTimeout(resolve, after > 0 ? after * 1000 : BACKOFF_MS * 2 ** attempt),
    )
  }
}

/** Embeds texts with Nemotron in batches, a few at once, each vector in its text's place. */
export async function embed(
  texts: string[],
  as: EmbedAs,
): Promise<{ vectors: number[][]; tokens: number }> {
  const batches: string[][] = []
  for (let i = 0; i < texts.length; i += INGEST.embeddingBatch) {
    batches.push(texts.slice(i, i + INGEST.embeddingBatch))
  }
  const replies: Reply[] = new Array(batches.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(INGEST.embeddingParallel, batches.length) }, async () => {
      while (next < batches.length) {
        const n = next++
        replies[n] = await request(batches[n] as string[], as)
      }
    }),
  )
  const vectors = replies.flatMap((reply) =>
    [...reply.data].sort((a, b) => a.index - b.index).map((d) => d.embedding),
  )
  if (vectors.length !== texts.length) throw new Error("Embedding reply is missing vectors")
  const tokens = replies.reduce((sum, reply) => sum + (reply.usage?.total_tokens ?? 0), 0)
  return { vectors, tokens }
}

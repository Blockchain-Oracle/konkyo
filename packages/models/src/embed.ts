import { createHash } from "node:crypto"
import { INGEST } from "@konkyo/config"
import { env } from "@konkyo/env/server"
import { tapedFetch } from "@konkyo/tape"
import { hedged } from "./hedge"
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

/**
 * A question is embedded while someone waits (about 0.3 s): a stalled request is asked again at
 * 2.5 s and given up at 8. A batch of passages is background work, so it gets longer.
 */
const TIMING: Record<EmbedAs, { timeoutMs: number; hedgeAfterMs?: number }> = {
  query: { timeoutMs: 8_000, hedgeAfterMs: 2_500 },
  passage: { timeoutMs: 30_000 },
}
/**
 * Retries per role. NVIDIA's endpoint has spells of fast 500s (in testing), and the next try usually works: a question retries quickly, a little longer
 * each time; background passages wait longer between tries.
 */
const RETRY: Record<EmbedAs, { attempts: number; backoffMs: number; maxBackoffMs: number }> = {
  query: { attempts: 6, backoffMs: 300, maxBackoffMs: 1_500 },
  passage: { attempts: 6, backoffMs: 2_000, maxBackoffMs: 20_000 },
}

type Reply = { data: { embedding: number[]; index: number }[]; usage?: { total_tokens?: number } }

/** One HTTP request to the embeddings endpoint, within its time limit. */
function post(input: string[], as: EmbedAs, signal: AbortSignal) {
  return limiterFor(INGEST.embeddingModel).run(
    () =>
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
        signal,
      }),
    signal,
  )
}

/**
 * One embedding, hedged for a question; a rate limit, a server error, a timeout or a dropped
 * connection waits (Retry-After when given) and tries again.
 */
async function request(input: string[], as: EmbedAs): Promise<Reply> {
  const { timeoutMs, hedgeAfterMs } = TIMING[as]
  const retry = RETRY[as]
  for (let attempt = 1; ; attempt++) {
    let failure: string
    let after = 0
    try {
      const res = await hedged({
        after: hedgeAfterMs,
        signal: AbortSignal.timeout(timeoutMs),
        attempt: (signal) => post(input, as, signal),
        discard: (late) => void late.body?.cancel().catch(() => undefined),
      })
      if (res.ok) return (await res.json()) as Reply
      if (res.status !== 429 && res.status < 500) {
        throw new Error(`Embedding failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
      }
      failure = `Embedding failed (${res.status})`
      after = Number(res.headers.get("retry-after")) * 1000
    } catch (error) {
      if ((error as Error).message.startsWith("Embedding failed")) throw error
      failure = `Embedding failed: ${(error as Error).message}`
    }
    if (attempt >= retry.attempts) throw new Error(failure)
    const backoff = Math.min(retry.backoffMs * 2 ** (attempt - 1), retry.maxBackoffMs)
    await new Promise((resolve) => setTimeout(resolve, after > 0 ? after : backoff))
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

import { createHash } from "node:crypto"
import { createOpenAI } from "@ai-sdk/openai"
import { INGEST } from "@konkyo/config"
import { env } from "@konkyo/env/server"
import { embedMany } from "ai"

const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY })

/** Cache key: the same text with the same model is never embedded twice. */
export const embeddingHash = (text: string) =>
  createHash("sha256").update(`${INGEST.embeddingModel}\n${text}`).digest("hex")

/** Embeds texts in batches with text-embedding-3-small (1536 dimensions). */
export async function embedTexts(
  texts: string[],
): Promise<{ vectors: number[][]; tokens: number }> {
  const vectors: number[][] = []
  let tokens = 0
  for (let i = 0; i < texts.length; i += INGEST.embeddingBatch) {
    const { embeddings, usage } = await embedMany({
      model: openai.embedding(INGEST.embeddingModel),
      values: texts.slice(i, i + INGEST.embeddingBatch),
      maxParallelCalls: INGEST.embeddingParallel,
    })
    vectors.push(...embeddings)
    tokens += usage?.tokens ?? 0
  }
  return { vectors, tokens }
}

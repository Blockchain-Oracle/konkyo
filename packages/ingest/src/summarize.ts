import { createOpenAI } from "@ai-sdk/openai"
import { INGEST } from "@konkyo/config"
import { env } from "@konkyo/env/server"
import { generateText } from "ai"

const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY })

/** Enough of a document to say what it is: its opening, where abstracts and introductions are. */
const SUMMARY_CHARS = 12_000

/**
 * Two or three plain sentences on what a file is and what it finds (plan F06). Written only from
 * the file's own text; the details panel says it was written by a model.
 */
export async function summarize(title: string, text: string): Promise<string | undefined> {
  const source = text.slice(0, SUMMARY_CHARS).trim()
  if (source.length < 200) return undefined
  const { text: summary } = await generateText({
    model: openai(INGEST.summaryModel),
    instructions:
      "You describe a document in someone's research library. Write two or three plain sentences: what it is and its main finding, argument or content. Use only the text given; if it is unclear, say less rather than guess. No preamble, no lists, no markdown.",
    prompt: `Title: ${title}\n\n${source}`,
    maxOutputTokens: 220,
    // The cost benchmark's pick for short grounded writing (gpt-6-luna, no reasoning).
    providerOptions: { openai: { reasoningEffort: "none" } },
    abortSignal: AbortSignal.timeout(INGEST.metadataTimeoutMs * 3),
  })
  return summary.trim() || undefined
}

import { createOpenAI } from "@ai-sdk/openai"
import { INGEST } from "@konkyo/config"
import { env } from "@konkyo/env/server"
import { generateText, Output } from "ai"
import { z } from "zod"

const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY })

/** Enough of a document to say what it is: its opening, where abstracts and introductions are. */
const SUMMARY_CHARS = 12_000

const Described = z.object({
  summary: z.string().describe("Two or three plain sentences"),
  title: z
    .string()
    .nullable()
    .describe("A plain title of at most 8 words naming what it is about, or null if unclear"),
})

/**
 * Two or three plain sentences on what a file is and what it finds (plan F06), and, for a file
 * still called by its file name (a recording, a scan), a plain title from its content. Written
 * only from the file's own text; the details panel says it was written by a model.
 */
export async function summarize(
  title: string,
  text: string,
  opts: { wantTitle?: boolean } = {},
): Promise<{ summary?: string; title?: string }> {
  const source = text.slice(0, SUMMARY_CHARS).trim()
  if (source.length < 200) return {}
  const { output } = await generateText({
    model: openai(INGEST.summaryModel),
    output: Output.object({ schema: Described }),
    instructions: `You describe a document in someone's research library. Write two or three plain sentences: what it is and its main finding, argument or content. Use only the text given; if it is unclear, say less rather than guess. No preamble, no lists, no markdown.${
      opts.wantTitle
        ? " It has no real title yet, only a file name: also give a plain title of at most 8 words naming what it is about (like a lecture or talk title), taken from its content; null if unclear."
        : " Set title to null."
    }`,
    prompt: `Title: ${title}\n\n${source}`,
    maxOutputTokens: 300,
    // The cost benchmark's pick for short grounded writing (gpt-6-luna, no reasoning).
    providerOptions: { openai: { reasoningEffort: "none" } },
    abortSignal: AbortSignal.timeout(INGEST.metadataTimeoutMs * 3),
  })
  return {
    summary: output.summary.trim() || undefined,
    title: (opts.wantTitle && output.title?.trim().replace(/^["“]|["”.]$/g, "")) || undefined,
  }
}

import { generateText, Output } from "ai"
import { z } from "zod"
import { guessIntent, type Intent, type VoiceKind } from "./intent"
import { model, reasoning, withFallback } from "./models"

const KINDS = [
  "ask",
  "find",
  "quiz",
  "note",
  "brief",
  "space",
  "catchup",
  "remember",
  "show",
  "done",
] as const satisfies readonly VoiceKind[]

const Read = z.object({
  kind: z.enum(KINDS),
  topic: z.string(),
  count: z.number().int().min(1).max(50).nullable(),
  and: z
    .object({
      kind: z.enum(KINDS),
      topic: z.string(),
      count: z.number().int().min(1).max(50).nullable(),
    })
    .nullable(),
})

/**
 * The words no pattern placed (`guessIntent` returned null), read by the cheap model. Code still
 * goes first here: by the time a call lands the words may have grown into a pattern.
 */
export async function readIntent(
  said: string,
  where: { spaceName?: string | null; signal?: AbortSignal },
): Promise<Intent> {
  const known = guessIntent(said)
  if (known) return known
  const { result } = await withFallback("intent", "planner", undefined, "voice intent", (choice) =>
    generateText({
      model: model(choice),
      providerOptions: reasoning(choice),
      abortSignal: where.signal,
      output: Output.object({ schema: Read }),
      instructions: `A person is talking to Konkyo, their research library, out loud. Read what they want from their words (a live speech transcript: no punctuation, maybe cut off).
Kinds: ask (a question about their sources, or a request to summarise/compare/explain them) · find (search the web for new papers or sources on a topic) · quiz (make practice questions) · note (start a written note) · brief (make a spoken audio summary) · space (make a new space, a project folder) · catchup (what changed since they last looked) · remember (they correct something Konkyo said or tell it a fact to keep) · show (show where the last answer's quote is) · done (they are finished talking).
topic: for ask, the question as they said it, cleaned up; for find, quiz, note, brief, space, what it is about ("" when they mean what is in view${where.spaceName ? `, the space "${where.spaceName}"` : ""}); for remember, the fact in their words.
count: a number they gave for questions or sources, else null.
and: a second thing asked in the same breath ("find papers on X and quiz me on them"), else null.
When it is a plain statement or topic with no verb, it is an ask about that topic.`,
      prompt: said,
    }).then((r) => r.output),
  )
  return {
    kind: result.kind,
    topic: result.topic,
    count: result.count ?? undefined,
    and: result.and
      ? { kind: result.and.kind, topic: result.and.topic, count: result.and.count ?? undefined }
      : undefined,
  }
}

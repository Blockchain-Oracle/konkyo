import { PUBLIC } from "@konkyo/config"
import { model } from "@konkyo/models"
import { generateText } from "ai"

export type Moderation = { flagged: boolean; categories: string[]; checked: boolean }

const SAFETY = { id: PUBLIC.moderationModel, reasoning: "off" } as const
/** The verdict is two short lines; the model card samples it near-greedily. */
const VERDICT_TOKENS = 60
const TEMPERATURE = 0.01

/**
 * One text through Nemotron Content Safety, which answers "User Safety: safe|unsafe" and, asked
 * for them, the categories broken ("Safety Categories: ..."). Null if no verdict came back.
 */
async function check(text: string, timeoutMs: number): Promise<Moderation | null> {
  const { text: verdict } = await generateText({
    model: model(SAFETY),
    prompt: text,
    maxOutputTokens: VERDICT_TOKENS,
    temperature: TEMPERATURE,
    providerOptions: { nvidia: { chat_template_kwargs: { request_categories: "/categories" } } },
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(timeoutMs),
  })
  const safety = verdict.match(/User Safety:\s*(safe|unsafe)/i)?.[1]?.toLowerCase()
  if (!safety) return null
  const categories = (verdict.match(/Safety Categories:\s*(.+)/i)?.[1] ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
  return { flagged: safety === "unsafe", categories, checked: true }
}

const QUESTION_TIMEOUT_MS = 8_000

/**
 * A public folder's question goes through Nemotron Content Safety first (plan F36). If it can't be
 * reached the question goes on, and the result says it wasn't checked: the Writer answers only
 * from the folder's own passages either way.
 */
export async function moderate(text: string): Promise<Moderation> {
  try {
    return (
      (await check(text.slice(0, PUBLIC.moderationChars), QUESTION_TIMEOUT_MS)) ?? {
        flagged: false,
        categories: [],
        checked: false,
      }
    )
  } catch {
    return { flagged: false, categories: [], checked: false }
  }
}

/** How long one batch may take, and the pause before its one retry. */
const BATCH_TIMEOUT_MS = 30_000
const RETRY_AFTER_MS = 1_500

/**
 * Many pieces, packed into as few checks as fit (a whole article is one), so publishing isn't a
 * burst of calls. One retry each; `checked` is false only if a batch fails both times.
 */
export async function moderateAll(pieces: string[]): Promise<Moderation> {
  const batches: string[] = []
  for (const piece of pieces.map((p) => p.trim()).filter(Boolean)) {
    const last = batches.at(-1)
    if (last !== undefined && last.length + piece.length + 2 <= PUBLIC.moderationChars)
      batches[batches.length - 1] = `${last}\n\n${piece}`
    else batches.push(piece.slice(0, PUBLIC.moderationChars))
  }
  const categories = new Set<string>()
  let flagged = false
  for (const batch of batches) {
    let result: Moderation | null = null
    for (let attempt = 0; attempt < 2 && !result; attempt++) {
      if (attempt) await new Promise((resolve) => setTimeout(resolve, RETRY_AFTER_MS))
      result = await check(batch, BATCH_TIMEOUT_MS).catch(() => null)
    }
    if (!result) return { flagged, categories: [...categories], checked: false }
    flagged ||= result.flagged
    for (const c of result.categories) categories.add(c)
  }
  return { flagged, categories: [...categories], checked: true }
}

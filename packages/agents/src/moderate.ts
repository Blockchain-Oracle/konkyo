import { PUBLIC } from "@konkyo/config"
import { env } from "@konkyo/env/server"

export type Moderation = { flagged: boolean; categories: string[]; checked: boolean }

/**
 * A public folder's question goes through OpenAI's moderation model first (plan F36; the endpoint
 * is free). If it can't be reached the question goes on, and the result says it wasn't checked:
 * the Writer answers only from the folder's own passages either way.
 */
export async function moderate(text: string): Promise<Moderation> {
  try {
    const res = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: PUBLIC.moderationModel, input: text.slice(0, 4000) }),
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) return { flagged: false, categories: [], checked: false }
    const body = (await res.json()) as {
      results?: { flagged: boolean; categories: Record<string, boolean> }[]
    }
    const result = body.results?.[0]
    return {
      flagged: Boolean(result?.flagged),
      categories: Object.entries(result?.categories ?? {})
        .filter(([, on]) => on)
        .map(([name]) => name),
      checked: Boolean(result),
    }
  } catch {
    return { flagged: false, categories: [], checked: false }
  }
}

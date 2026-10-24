import { readIntent } from "@konkyo/agents"
import { z } from "zod"
import { route } from "@/lib/api"

/** Words no pattern placed, read by the cheap model while you are still talking (plan §16.5). */
export const POST = route(
  async ({ body, request }) =>
    readIntent(body.said, { spaceName: body.spaceName, signal: request.signal }),
  z.object({ said: z.string().trim().min(1).max(600), spaceName: z.string().max(120).nullish() }),
)

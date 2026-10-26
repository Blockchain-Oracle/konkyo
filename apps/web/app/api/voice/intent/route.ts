import { readIntent } from "@konkyo/agents"
import { z } from "zod"
import { route } from "@/lib/api"
import { LibraryError } from "@/lib/library"
import { inVoiceSession } from "@/lib/voice-server"

/** Words no pattern placed, read by the cheap model while you are still talking. */
export const POST = route(
  async ({ userId, body, request }) => {
    // a model call per ask: only for someone talking now (a voice session, already capped)
    if (!(await inVoiceSession(userId)))
      throw new LibraryError("Start talking to Konkyo first", 429)
    return readIntent(body.said, { spaceName: body.spaceName, signal: request.signal })
  },
  z.object({ said: z.string().trim().min(1).max(600), spaceName: z.string().max(120).nullish() }),
)

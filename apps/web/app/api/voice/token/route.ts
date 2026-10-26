import { route } from "@/lib/api"
import { scribeToken } from "@/lib/voice-server"

/** A single-use token for Scribe realtime: the browser talks to ElevenLabs with it. */
export const POST = route(async ({ userId }) => ({ token: await scribeToken(userId) }))

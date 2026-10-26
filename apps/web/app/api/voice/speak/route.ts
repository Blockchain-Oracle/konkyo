import { z } from "zod"
import { route } from "@/lib/api"
import { getSettings } from "@/lib/settings"
import { speak } from "@/lib/voice-server"

/** Read aloud: the clip's address and its word timings, made once and cached. */
export const POST = route(
  async ({ userId, body }) => {
    const voiceId = body.voice === "speaker" ? (await getSettings(userId)).voiceId : undefined
    const clip = await speak(userId, body.text, body.voice, voiceId)
    return { url: `/api/voice/clip/${clip.hash}`, words: clip.words }
  },
  z.object({
    text: z.string().trim().min(1).max(4000),
    voice: z.enum(["speaker", "asker"]).default("speaker"),
  }),
)

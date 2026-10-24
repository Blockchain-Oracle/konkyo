import { VOICE } from "@konkyo/config"
import { z } from "zod"
import { route } from "@/lib/api"
import { speak } from "@/lib/voice-server"

const voiceIds = VOICE.voices.map((voice) => voice.id) as [string, ...string[]]

/** Try a voice (the sounds popover): one fixed line, made once per voice and cached for everyone. */
export const POST = route(
  async ({ userId, body }) => {
    const clip = await speak(userId, VOICE.sampleLine, "speaker", body.voiceId)
    return { url: `/api/voice/clip/${clip.hash}`, words: clip.words }
  },
  z.object({ voiceId: z.enum(voiceIds) }),
)

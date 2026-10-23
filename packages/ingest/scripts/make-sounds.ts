/**
 * The five Study sounds (plan §7.8), made once with ElevenLabs Sound Effects and kept in
 * apps/web/public/sounds. Run again only to remake them:
 *   node ../../scripts/with-env.mjs tsx scripts/make-sounds.ts
 */
import { writeFile } from "node:fs/promises"
import path from "node:path"
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js"

const SOUNDS = {
  right: {
    text: "Soft bright two-note marimba chime rising, gentle positive confirmation, clean UI sound",
    seconds: 0.6,
  },
  "try-again": {
    text: "Soft muted low wooden tap, gentle and neutral, not negative, minimal UI sound",
    seconds: 0.5,
  },
  hint: {
    text: "Light airy single glass tick with a soft shimmer, subtle UI notification",
    seconds: 0.5,
  },
  round: {
    text: "Short warm three-note ascending marimba flourish, satisfying completion, UI sound",
    seconds: 0.9,
  },
  streak: {
    text: "Sparkling ascending chime arpeggio with a soft shimmer, small joyful celebration, UI sound",
    seconds: 0.9,
  },
} as const

const out = path.resolve(import.meta.dirname, "../../../apps/web/public/sounds")
const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY })

for (const [name, { text, seconds }] of Object.entries(SOUNDS)) {
  const stream = await client.textToSoundEffects.convert({
    text,
    durationSeconds: seconds,
    promptInfluence: 0.6,
    outputFormat: "mp3_44100_64",
  })
  const bytes = Buffer.from(await new Response(stream).arrayBuffer())
  await writeFile(path.join(out, `${name}.mp3`), bytes)
  console.info(`${name}.mp3 ${Math.round(bytes.length / 1024)} KB`)
}

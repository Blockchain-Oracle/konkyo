import "server-only"
import { createHash } from "node:crypto"
import { VOICE } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { env } from "@konkyo/env/server"
import { getBytes, headObject, objectKey, putBytes } from "@konkyo/storage"
import { LibraryError } from "./library"
import { allowanceLeft } from "./usage"

const API = "https://api.elevenlabs.io/v1"

/** A single-use Scribe realtime token (15 minutes), counted as one voice session. */
export async function scribeToken(ownerId: string): Promise<string> {
  const reason = await allowanceLeft(ownerId, "voiceSessions")
  if (reason) throw new LibraryError(reason, 429)
  const res = await fetch(`${API}/single-use-token/realtime_scribe`, {
    method: "POST",
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
  })
  const body = (await res.json().catch(() => ({}))) as { token?: string }
  if (!res.ok || !body.token) {
    console.error("[voice] token", res.status)
    throw new LibraryError("Voice isn't available right now. Type instead.", 503)
  }
  await db.insert(schema.voiceUsage).values({ ownerId, kind: "listen", amount: 1 })
  return body.token
}

export type SpokenWord = { word: string; start: number; end: number }
export type Clip = { hash: string; words: SpokenWord[] }

/** ElevenLabs' per-character times → words (a word ends where its last character does). */
function wordsOf(alignment: {
  characters: string[]
  character_start_times_seconds: number[]
  character_end_times_seconds: number[]
}): SpokenWord[] {
  const out: SpokenWord[] = []
  let word = ""
  let start = 0
  let end = 0
  alignment.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (word) out.push({ word, start, end })
      word = ""
      return
    }
    if (!word) start = alignment.character_start_times_seconds[i] ?? end
    word += ch
    end = alignment.character_end_times_seconds[i] ?? end
  })
  if (word) out.push({ word, start, end })
  return out
}

/**
 * Text read aloud with word timings (plan §16.5 "Read aloud"): ElevenLabs Flash with timestamps,
 * cached in storage by hash(voice + model + text), so a clip is made once for everyone and a
 * cached one costs nothing. Only newly made characters count against the daily cap.
 */
export async function speak(
  ownerId: string,
  text: string,
  who: "speaker" | "asker",
): Promise<Clip> {
  const voice = VOICE[who]
  const said = text.replace(/\s+/g, " ").trim().slice(0, VOICE.maxSpeakChars)
  if (!said) throw new LibraryError("Nothing to read", 400)
  const hash = createHash("sha256")
    .update(`${voice.id}|${VOICE.ttsModel}|${VOICE.outputFormat}|${said}`)
    .digest("hex")
    .slice(0, 40)
  const timing = objectKey("audio", "tts", `${hash}.json`)
  if (await headObject(timing).catch(() => null)) {
    const words = JSON.parse(new TextDecoder().decode(await getBytes(timing))) as SpokenWord[]
    return { hash, words }
  }
  const reason = await allowanceLeft(ownerId, "readAloud", said.length)
  if (reason) throw new LibraryError(reason, 429)
  const res = await fetch(
    `${API}/text-to-speech/${voice.id}/with-timestamps?output_format=${VOICE.outputFormat}`,
    {
      method: "POST",
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({ text: said, model_id: VOICE.ttsModel }),
    },
  )
  if (!res.ok) {
    console.error("[voice] speak", res.status, (await res.text()).slice(0, 200))
    throw new LibraryError("Couldn't read that aloud right now.", 503)
  }
  const body = (await res.json()) as {
    audio_base64: string
    alignment: Parameters<typeof wordsOf>[0]
  }
  const words = wordsOf(body.alignment)
  await putBytes(
    objectKey("audio", "tts", `${hash}.mp3`),
    Buffer.from(body.audio_base64, "base64"),
    "audio/mpeg",
  )
  await putBytes(timing, new TextEncoder().encode(JSON.stringify(words)), "application/json")
  await db.insert(schema.voiceUsage).values({ ownerId, kind: "speak", amount: said.length })
  return { hash, words }
}

export const clipKey = (hash: string) => objectKey("audio", "tts", `${hash}.mp3`)

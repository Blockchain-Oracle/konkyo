import "server-only"
import { createHash } from "node:crypto"
import { VOICE } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { env } from "@konkyo/env/server"
import { getBytes, headObject, objectKey, putBytes } from "@konkyo/storage"
import { and, eq, gte } from "drizzle-orm"
import { LibraryError } from "./library"
import { allowanceLeft } from "./usage"

const API = "https://api.elevenlabs.io/v1"

const { voiceUsage } = schema

/**
 * Charge first, then count: requests made in parallel each see the others' rows, so a burst can't
 * slip past the cap. Over it, the charge is taken back. Returns the row to refund on failure.
 */
async function charge(
  ownerId: string,
  kind: "listen" | "speak",
  amount: number,
  allowance: "voiceSessions" | "readAloud",
) {
  const [row] = await db
    .insert(voiceUsage)
    .values({ ownerId, kind, amount })
    .returning({ id: voiceUsage.id })
  const refund = () => db.delete(voiceUsage).where(eq(voiceUsage.id, row?.id ?? ""))
  const reason = await allowanceLeft(ownerId, allowance, 0)
  if (reason) {
    await refund()
    throw new LibraryError(reason, 429)
  }
  return refund
}

/** A single-use Scribe realtime token (15 minutes), counted as one voice session. */
export async function scribeToken(ownerId: string): Promise<string> {
  const refund = await charge(ownerId, "listen", 1, "voiceSessions")
  const res = await fetch(`${API}/single-use-token/realtime_scribe`, {
    method: "POST",
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
  })
  const body = (await res.json().catch(() => ({}))) as { token?: string }
  if (!res.ok || !body.token) {
    await refund()
    console.error("[voice] token", res.status)
    throw new LibraryError("Voice isn't available right now. Type instead.", 503)
  }
  return body.token
}

/** The intent model only reads words said in a voice session started in the last 15 minutes. */
export async function inVoiceSession(ownerId: string) {
  const since = new Date(Date.now() - 16 * 60_000)
  const row = await db.query.voiceUsage.findFirst({
    where: and(
      eq(voiceUsage.ownerId, ownerId),
      eq(voiceUsage.kind, "listen"),
      gte(voiceUsage.createdAt, since),
    ),
    columns: { id: true },
  })
  return Boolean(row)
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
  const refund = await charge(ownerId, "speak", said.length, "readAloud")
  const res = await fetch(
    `${API}/text-to-speech/${voice.id}/with-timestamps?output_format=${VOICE.outputFormat}`,
    {
      method: "POST",
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({ text: said, model_id: VOICE.ttsModel }),
    },
  )
  if (!res.ok) {
    await refund()
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
  return { hash, words }
}

export const clipKey = (hash: string) => objectKey("audio", "tts", `${hash}.mp3`)

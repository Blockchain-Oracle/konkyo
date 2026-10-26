import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js"
import { BRIEF } from "@konkyo/config"
import { env } from "@konkyo/env/server"
import type { Word } from "./transcript"

let client: ElevenLabsClient | undefined

export type SpokenLine = { voiceId: string; text: string }

/**
 * A two-voice script → one mp3. The response's own line
 * timings drift up to 1.8 s after 30 s, so they're kept only as a fallback: the brief's
 * times come from a Scribe pass over this audio (`timeLines`).
 */
export async function speakDialogue(lines: SpokenLine[]) {
  client ??= new ElevenLabsClient({ apiKey: env.ELEVENLABS_API_KEY })
  const res = (await client.textToDialogue.convertWithTimestamps({
    modelId: BRIEF.model,
    outputFormat: BRIEF.outputFormat,
    inputs: lines.map((l) => ({ text: l.text, voiceId: l.voiceId })),
  } as never)) as {
    audioBase64: string
    voiceSegments?: {
      startTimeSeconds: number
      endTimeSeconds: number
      dialogueInputIndex: number
    }[]
  }
  const segments = res.voiceSegments ?? []
  return {
    audio: new Uint8Array(Buffer.from(res.audioBase64, "base64")),
    /** Each line's span by the dialogue API's own clock (drifts; a fallback only). */
    approximate: lines.map((_, i) => {
      const mine = segments.filter((s) => s.dialogueInputIndex === i)
      return {
        start: mine[0]?.startTimeSeconds ?? 0,
        end: mine.at(-1)?.endTimeSeconds ?? mine[0]?.startTimeSeconds ?? 0,
      }
    }),
  }
}

const wordsOf = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

/**
 * Each script line's start and end in the real audio: the script's words are walked in order
 * against Scribe's timed words, each matched to the next equal word within a short look-ahead
 * (Scribe may split or drop one). A line no word of which matched keeps its fallback time.
 */
export function timeLines(
  texts: string[],
  words: Word[],
  fallback: { start: number; end: number }[],
): { start: number; end: number }[] {
  const heard = words.flatMap((w) =>
    wordsOf(w.text).map((t) => ({ t, start: w.start, end: w.end })),
  )
  let at = 0
  return texts.map((text, i) => {
    let start: number | undefined
    let end: number | undefined
    for (const word of wordsOf(text)) {
      for (let k = at; k < Math.min(heard.length, at + 6); k++) {
        if (heard[k]?.t === word) {
          start ??= heard[k]?.start
          end = heard[k]?.end
          at = k + 1
          break
        }
      }
    }
    const fb = fallback[i] ?? { start: 0, end: 0 }
    return start != null && end != null ? { start, end } : fb
  })
}

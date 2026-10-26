import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js"
import { INGEST } from "@konkyo/config"
import { env } from "@konkyo/env/server"

export type Word = { text: string; start: number; end: number; speaker?: string }

export type TranscriptPassage = {
  text: string
  tStart: number
  tEnd: number
  speaker: string | null
}

let client: ElevenLabsClient | undefined

/** Recording → words with timestamps and speakers (ElevenLabs Scribe v2; 0% word errors in testing). */
export async function transcribe(
  bytes: Uint8Array,
  filename: string,
): Promise<{ words: Word[]; duration: number }> {
  client ??= new ElevenLabsClient({ apiKey: env.ELEVENLABS_API_KEY })
  const result = (await client.speechToText.convert({
    file: new File([Buffer.from(bytes)], filename),
    modelId: INGEST.transcriptionModel,
    timestampsGranularity: "word",
    diarize: true,
    tagAudioEvents: false,
  })) as {
    words?: { text: string; start?: number; end?: number; type?: string; speakerId?: string }[]
  }
  const words = (result.words ?? [])
    .filter((w) => w.type !== "spacing" && w.text.trim())
    .map((w) => ({
      text: w.text.trim(),
      start: w.start ?? 0,
      end: w.end ?? w.start ?? 0,
      speaker: w.speakerId,
    }))
  return { words, duration: words.at(-1)?.end ?? 0 }
}

/**
 * Groups timed words into passages: a new passage starts at a speaker change, after a pause, or
 * once the current one passes the target length and reaches a sentence end. Each citation can then
 * seek the recording to the passage's first word.
 */
export function wordsToPassages(words: Word[]): TranscriptPassage[] {
  const out: TranscriptPassage[] = []
  let current: Word[] = []
  const flush = () => {
    const first = current[0]
    const last = current.at(-1)
    if (first && last) {
      out.push({
        text: current
          .map((w) => w.text)
          .join(" ")
          .replace(/\s+([,.;:!?])/g, "$1"),
        tStart: first.start,
        tEnd: last.end,
        speaker: first.speaker ?? null,
      })
    }
    current = []
  }
  for (const word of words) {
    const last = current.at(-1)
    if (last) {
      const speakerChange = word.speaker !== last.speaker
      const pause = word.start - last.end > INGEST.transcriptPauseSeconds
      const long = last.end - (current[0]?.start ?? last.end) > INGEST.transcriptPassageSeconds
      if (speakerChange || pause || (long && /[.!?]$/.test(last.text))) flush()
    }
    current.push(word)
  }
  flush()
  return out
}

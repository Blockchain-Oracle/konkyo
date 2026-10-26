"use client"

import { VOICE } from "@konkyo/config"
import { readAloud, sentencesOf, stopReading, useReading } from "@/lib/read-aloud"
import { sound } from "@/lib/sounds"

/** The sentences of an answer that fit one reading (VOICE.maxSpeakChars). */
function readable(text: string) {
  const out: string[] = []
  let length = 0
  for (const s of sentencesOf(text)) {
    if (out.length && length + s.length > VOICE.maxSpeakChars) break
    out.push(s)
    length += s.length + 1
  }
  return out
}

/**
 * ▶ listen on an answer: ElevenLabs reads it, the sentence being read
 * underlined where the answer is shown (`useSpokenHighlight`). A second tap stops it.
 */
export function ListenButton({
  id,
  text,
  className,
}: {
  id: string
  text: string
  className?: string
}) {
  const reading = useReading(id)
  return (
    <button
      type="button"
      className={className}
      aria-pressed={Boolean(reading)}
      onClick={() => {
        sound("tap")
        if (reading) stopReading()
        else void readAloud(id, readable(text))
      }}
    >
      <span aria-hidden="true">{reading ? "■" : "▶"}</span>{" "}
      {reading?.state === "loading" ? "getting it ready…" : reading ? "stop" : "listen"}
    </button>
  )
}

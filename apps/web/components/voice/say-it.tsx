"use client"

import { useEffect, useRef } from "react"
import { sound } from "@/lib/sounds"
import { primeVoice, useVoice } from "@/lib/voice"
import { VoiceOrb } from "./voice-orb"

/**
 * Answer out loud in a study round: a small orb beside
 * the answer field. Tap it and talk: the words fill the field as Scribe hears them, and the pause
 * checks the answer, the same as pressing check. No mic: it says so and the field stays.
 */
export function SayIt({
  onWords,
  onDone,
  disabled,
  keyterms,
}: {
  onWords: (text: string) => void
  onDone: () => void
  disabled?: boolean
  /** The round's own words, so Scribe hears its terms right. */
  keyterms?: string[]
}) {
  const done = useRef(onDone)
  done.current = onDone
  const voice = useVoice(
    {
      words: (text) => onWords(text.replace(/[.!?]+$/, "")),
      ask: (said) => {
        onWords(said.replace(/[.!?]+$/, ""))
        // the field has the words on the next render; check then, with the newest handler
        window.setTimeout(() => done.current(), 60)
        return undefined
      },
    },
    { keyterms },
  )
  const listening = voice.state === "listening"
  useEffect(() => {
    if (disabled && listening) voice.cancel()
  }, [disabled, listening, voice])

  return (
    <button
      type="button"
      className={`say-it${listening ? " is-listening" : ""}`}
      disabled={disabled}
      onPointerDown={() => !listening && primeVoice()}
      onClick={() => {
        if (listening) {
          sound("tap")
          voice.finish("done")
          return
        }
        sound("promote")
        void voice.start()
      }}
      aria-pressed={listening}
      title={voice.problem ?? (listening ? "done" : "say it")}
    >
      <span className="say-it-orb" aria-hidden="true">
        <VoiceOrb state={listening ? "listening" : "idle"} level={voice.level} />
      </span>
      <b>{voice.problem ? "type it" : listening ? "listening…" : "say it"}</b>
    </button>
  )
}

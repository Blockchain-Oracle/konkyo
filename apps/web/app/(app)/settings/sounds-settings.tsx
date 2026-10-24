"use client"

import { VOICE } from "@konkyo/config"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { api } from "@/lib/fetcher"
import { adoptInterfaceSounds, setInterfaceSounds } from "@/lib/sounds"
import { useSettings } from "@/lib/use-settings"
import { SelectRow, SwitchRow } from "./setting-rows"

const VOICES = VOICE.voices.map((voice) => ({ value: voice.id, label: voice.name }))

/** Sounds and voice (F62): the dock's ♪ menu, with study's own sounds beside it. */
export function SoundsSettings() {
  const { settings, save } = useSettings()
  const [trying, setTrying] = useState(false)
  const player = useRef<HTMLAudioElement | null>(null)
  useEffect(() => () => player.current?.pause(), [])
  useEffect(() => {
    if (settings) adoptInterfaceSounds(settings.interfaceSounds)
  }, [settings])

  const voiceId = settings?.voiceId ?? VOICE.speaker.id
  const hear = async () => {
    player.current?.pause()
    if (trying) return setTrying(false)
    setTrying(true)
    try {
      const { url } = await api<{ url: string }>("/api/voice/sample", {
        method: "POST",
        json: { voiceId },
      })
      const audio = new Audio(url)
      player.current = audio
      audio.onended = () => setTrying(false)
      await audio.play()
    } catch (error) {
      setTrying(false)
      toast.error((error as Error).message)
    }
  }

  return (
    <div className="setting-rows">
      <SwitchRow
        id="interface-sounds"
        title="Interface sounds"
        about="A tap, a place and a check as things happen. Off is silent everywhere but Study."
        checked={settings?.interfaceSounds ?? true}
        disabled={!settings}
        onChange={(on) => {
          setInterfaceSounds(on)
          save.mutate({ interfaceSounds: on })
        }}
      />
      <SwitchRow
        id="read-aloud"
        title="Read answers aloud"
        about="After you ask out loud, Konkyo says the short answer. Off, it only shows it."
        checked={settings?.readAloud ?? true}
        disabled={!settings}
        onChange={(on) => save.mutate({ readAloud: on })}
      />
      <SelectRow
        title="Konkyo's voice"
        about={`The voice it answers and reads in: ${
          VOICE.voices.find((voice) => voice.id === voiceId)?.about ?? VOICE.voices[0].about
        }.`}
        value={voiceId}
        options={VOICES}
        disabled={!settings}
        onChange={(id) => save.mutate({ voiceId: id })}
      >
        <button
          type="button"
          className={`setting-hear${trying ? " is-playing" : ""}`}
          onClick={() => void hear()}
          aria-label={trying ? "Stop" : "Hear this voice"}
        >
          <span aria-hidden="true">{trying ? "■" : "▶"}</span>
        </button>
      </SelectRow>
      <SwitchRow
        id="study-sound"
        title="Study sounds"
        about="A soft sound for right, try again, hints and a finished round. Only ever in Study."
        checked={settings?.studySound ?? true}
        disabled={!settings}
        onChange={(on) => save.mutate({ studySound: on })}
      />
    </div>
  )
}

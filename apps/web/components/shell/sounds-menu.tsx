"use client"

/*
 * The ♪ on the dock opens OurSpaces' sound menu (src/components/ActionDock.tsx, the radio's
 * `dock-sound-menu`; MIT, Copyright (c) 2026 Thomas Nguyen). Konkyo has no radio: its rows are the
 * interface sounds, whether answers are read aloud, and the voice Konkyo answers in (plan F62).
 */

import { VOICE } from "@konkyo/config"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { api } from "@/lib/fetcher"
import {
  adoptInterfaceSounds,
  interfaceSoundsOn,
  setInterfaceSounds,
  sound,
  tapAudio,
} from "@/lib/sounds"
import { useSettings } from "@/lib/use-settings"

export function SoundsMenu() {
  const { settings, save } = useSettings()
  const [open, setOpen] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [trying, setTrying] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const player = useRef<HTMLAudioElement | null>(null)

  // This browser starts where the account left off; the menu shows what plays.
  useEffect(() => {
    if (settings) adoptInterfaceSounds(settings.interfaceSounds)
    setSoundOn(interfaceSoundsOn())
  }, [settings])

  useEffect(() => {
    document.body.classList.toggle("dock-menu-open", open)
    return () => document.body.classList.remove("dock-menu-open")
  }, [open])

  useEffect(() => {
    if (!open) return
    // focus goes into the menu and back to its button when it closes
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    root.current?.querySelector<HTMLElement>(".sounds-menu button")?.focus()
    const away = (event: PointerEvent) =>
      root.current && !root.current.contains(event.target as Node) && setOpen(false)
    const esc = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false)
    window.addEventListener("pointerdown", away)
    window.addEventListener("keydown", esc)
    return () => {
      window.removeEventListener("pointerdown", away)
      window.removeEventListener("keydown", esc)
      const lost = !document.activeElement || document.activeElement === document.body
      if (lost && opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [open])

  useEffect(() => () => player.current?.pause(), [])

  const toggleSounds = () => {
    const next = !soundOn
    setSoundOn(next)
    setInterfaceSounds(next)
    save.mutate({ interfaceSounds: next })
  }

  const readAloud = settings?.readAloud ?? true
  const voiceId = settings?.voiceId ?? VOICE.speaker.id

  /** Hear a voice say one line (made once per voice, then cached for everyone). */
  const tryVoice = async (id: string) => {
    player.current?.pause()
    player.current = null
    if (trying === id) return setTrying(null)
    setTrying(id)
    const audio = tapAudio()
    player.current = audio
    try {
      const { url } = await api<{ url: string }>("/api/voice/sample", {
        method: "POST",
        json: { voiceId: id },
      })
      if (player.current !== audio) return
      audio.onended = () => setTrying((now) => (now === id ? null : now))
      audio.src = url
      await audio.play()
    } catch (error) {
      setTrying(null)
      toast.error((error as Error).message)
    }
  }

  return (
    <div className="dock-sound" ref={root}>
      {open && (
        <div className="dock-sound-menu sounds-menu" role="dialog" aria-label="Sounds and voice">
          <button
            type="button"
            className={`dock-sound-switch${soundOn ? "" : " is-muted"}`}
            onClick={toggleSounds}
            aria-pressed={soundOn}
          >
            interface sounds
            <b>{soundOn ? "on" : "off"}</b>
          </button>
          <button
            type="button"
            className={`dock-sound-switch${readAloud ? "" : " is-muted"}`}
            onClick={() => {
              sound("tap")
              save.mutate({ readAloud: !readAloud })
            }}
            aria-pressed={readAloud}
          >
            read answers aloud
            <b>{readAloud ? "on" : "off"}</b>
          </button>
          <fieldset className="sounds-voices">
            <legend className="sounds-label">konkyo&apos;s voice</legend>
            {VOICE.voices.map((voice) => {
              const picked = voice.id === voiceId
              return (
                <div key={voice.id} className={`sounds-voice${picked ? " is-picked" : ""}`}>
                  <label className="sounds-voice-pick">
                    <input
                      type="radio"
                      name="konkyo-voice"
                      className="sr-only"
                      checked={picked}
                      onChange={() => {
                        sound("tap")
                        save.mutate({ voiceId: voice.id })
                      }}
                    />
                    <i aria-hidden="true" />
                    <span>
                      <strong>{voice.name}</strong>
                      <small>{voice.about}</small>
                    </span>
                  </label>
                  <button
                    type="button"
                    className={`sounds-voice-try${trying === voice.id ? " is-playing" : ""}`}
                    onClick={() => void tryVoice(voice.id)}
                    aria-label={trying === voice.id ? `Stop ${voice.name}` : `Hear ${voice.name}`}
                  >
                    <span aria-hidden="true">{trying === voice.id ? "■" : "▶"}</span>
                  </button>
                </div>
              )
            })}
          </fieldset>
        </div>
      )}
      <button
        type="button"
        className={`action-dock-sound${soundOn ? "" : " is-muted"}${open ? " is-active" : ""}`}
        onClick={() => {
          sound("tap")
          setOpen((was) => !was)
        }}
        aria-expanded={open}
        aria-label="Sounds and voice"
        title="Sounds and voice"
      >
        <span aria-hidden="true">♪</span>
      </button>
    </div>
  )
}

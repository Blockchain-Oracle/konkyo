"use client"

import type { Route } from "next"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { VoiceOrb, type VoiceState } from "@/components/voice/voice-orb"
import { type Focus, WHOLE_LIBRARY } from "@/lib/focus"
import { holdQuestion } from "@/lib/pending-question"
import { interfaceSoundsOn, setInterfaceSounds, sound } from "@/lib/sounds"
import { useUnread } from "@/lib/use-inbox"
import { useCurrentSpaceId } from "./rail"

/** Pages with their own composer or nothing to ask about don't show the dock (R2). */
const NO_DOCK = [
  /^\/chats\/[^/]+/,
  /^\/write\/[^/]+/,
  /^\/study\/session/,
  /^\/settings/,
  /^\/trash/,
]

export function useDockVisible() {
  const pathname = usePathname()
  return !NO_DOCK.some((re) => re.test(pathname))
}

/**
 * The dock: OurSpaces' ActionDock, ported (its markup and CSS, house.css). The orb leads, with a
 * quiet prompt beside it; tap either and the orb lifts and swells, the utilities step out and the
 * say strip takes the bar. Until the voice stage (S16) the strip takes typed words: each key
 * stirs the orb. ✦ is what moved; the bubble is your chats; ♪ turns interface sounds on or off.
 */
export function Dock() {
  const router = useRouter()
  const spaceId = useCurrentSpaceId()
  const { data: unread } = useUnread()
  const [mood, setMood] = useState<VoiceState>("idle")
  const [text, setText] = useState("")
  const [soundOn, setSoundOn] = useState(true)
  const level = useRef(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => setSoundOn(interfaceSoundsOn()), [])
  useEffect(() => {
    if (mood === "listening") input.current?.focus()
  }, [mood])
  // Each key stirs the orb, then it settles (a fast attack and slow release, as for a voice).
  useEffect(() => {
    let raf = 0
    const settle = () => {
      level.current *= 0.9
      raf = requestAnimationFrame(settle)
    }
    raf = requestAnimationFrame(settle)
    return () => cancelAnimationFrame(raf)
  }, [])

  const open = () => {
    sound(mood === "idle" ? "promote" : "tap")
    setMood(mood === "idle" ? "listening" : "idle")
    if (mood !== "idle") setText("")
  }
  const ask = () => {
    const question = text.trim()
    if (!question) return
    setMood("working")
    const focus: Focus = spaceId ? { fileIds: [], folderIds: [spaceId] } : WHOLE_LIBRARY
    const chatId = crypto.randomUUID()
    holdQuestion(chatId, { text: question, focus })
    sound("place")
    router.push(`/chats/${chatId}` as Route)
    setText("")
    setMood("idle")
  }

  return (
    <nav className="action-dock" aria-label="Ask and catch up">
      <div className={`dock-voice is-${mood}`}>
        <button
          type="button"
          className="dock-voice-orb"
          onClick={open}
          title={mood === "idle" ? "Ask" : "Close"}
          aria-label={mood === "idle" ? "Ask" : "Close"}
        >
          <span className="voice-orb-host">
            <VoiceOrb state={mood} level={level} />
          </span>
        </button>
        {mood === "idle" && (
          <button type="button" className="dock-voice-ask" onClick={open}>
            {spaceId ? "ask this space" : "ask anything"}
          </button>
        )}
        <div className="dock-voice-say" aria-live="polite">
          <form
            className="dock-voice-say-inner"
            onSubmit={(event) => {
              event.preventDefault()
              ask()
            }}
          >
            {mood !== "idle" && (
              <input
                ref={input}
                value={text}
                onChange={(event) => {
                  setText(event.target.value)
                  level.current = Math.min(1, level.current + 0.45)
                }}
                onKeyDown={(event) => event.key === "Escape" && open()}
                placeholder={spaceId ? "ask this space…" : "ask your library…"}
                aria-label="Your question"
                className="dock-voice-text w-[min(52vw,420px)] bg-transparent caret-lime outline-none placeholder:text-white/45"
              />
            )}
            {mood === "listening" && (
              <button type="submit" className="dock-voice-done" disabled={!text.trim()}>
                ask
              </button>
            )}
          </form>
        </div>
      </div>
      <span className="action-dock-divider" aria-hidden="true" />
      <Link
        href={"/inbox" as Route}
        onClick={() => sound("tap")}
        className="action-dock-ai relative inline-flex min-h-[42px] items-center rounded-full"
        title="What moved"
      >
        <span aria-hidden="true">✦</span>
        <b className="action-dock-label">catch me up</b>
        {unread ? (
          <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-white text-[10px] font-extrabold text-ink tabular-nums">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </Link>
      <Link
        href={"/chats" as Route}
        onClick={() => sound("tap")}
        className="action-dock-chat inline-flex min-h-[42px] items-center rounded-full"
        title="Chats"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3.5 5.5a2.5 2.5 0 0 1 2.5-2.5h8a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5H9.2L5.6 16.4V13A2.5 2.5 0 0 1 3.5 10.5z" />
        </svg>
        <b className="action-dock-label">chats</b>
      </Link>
      <button
        type="button"
        className={`action-dock-sound${soundOn ? "" : " is-muted"}`}
        onClick={() => {
          const next = !soundOn
          setSoundOn(next)
          setInterfaceSounds(next)
        }}
        aria-pressed={soundOn}
        aria-label={soundOn ? "Mute interface sounds" : "Turn on interface sounds"}
        title={soundOn ? "Mute sounds" : "Turn on sounds"}
      >
        <span aria-hidden="true">♪</span>
      </button>
    </nav>
  )
}

/** The dock lives on every page with something to ask about. */
export function DockArea() {
  const visible = useDockVisible()
  return visible ? <Dock /> : null
}

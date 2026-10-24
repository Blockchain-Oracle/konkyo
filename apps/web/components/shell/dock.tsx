"use client"

import { useChat } from "@ai-sdk/react"
import type { KonkyoMessage } from "@konkyo/agents"
import { useQueryClient } from "@tanstack/react-query"
import { DefaultChatTransport } from "ai"
import type { Route } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { VoiceOrb, type VoiceState } from "@/components/voice/voice-orb"
import {
  composerMounted,
  type QuotedPassage,
  quoteInComposer,
  useComposerQuote,
  useDockPresence,
} from "@/lib/composer-draft"
import { setLitSources } from "@/lib/lit-sources"
import { interfaceSoundsOn, setInterfaceSounds, sound } from "@/lib/sounds"
import { CatchupPanel, useCatchup } from "./catchup-panel"
import { useCurrentSpaceId, useSpaces } from "./rail"

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
 * The panel's thread is a real chat (saved, openable in full), scoped to the space you're in. A
 * new space starts a new thread, since a chat keeps the scope it was asked in.
 */
function usePanelChat(spaceId: string | null) {
  const queryClient = useQueryClient()
  const [chatId, setChatId] = useState(() => crypto.randomUUID())
  const scope = useRef(spaceId)
  useEffect(() => {
    if (scope.current === spaceId) return
    scope.current = spaceId
    setChatId(crypto.randomUUID())
  }, [spaceId])
  const transport = useMemo(
    () =>
      new DefaultChatTransport<KonkyoMessage>({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ id, messages, trigger }) => ({
          body: {
            chatId: id,
            message: messages.at(-1),
            trigger,
            scope: scope.current ? { folderIds: [scope.current] } : undefined,
          },
        }),
      }),
    [],
  )
  const { messages, sendMessage, status, error } = useChat<KonkyoMessage>({
    id: chatId,
    transport,
    onFinish: () => {
      void queryClient.invalidateQueries({ queryKey: ["chats"] })
      void queryClient.invalidateQueries({ queryKey: ["catchup"] })
    },
  })
  // A question about a selected passage carries it, as the chat's composer does.
  const send = useCallback(
    (text: string, quote?: QuotedPassage) =>
      void sendMessage({
        role: "user",
        parts: [
          ...(quote ? [{ type: "data-quote" as const, data: quote }] : []),
          { type: "text" as const, text },
        ],
      }),
    [sendMessage],
  )
  return {
    chatId,
    messages,
    running: status === "submitted" || status === "streaming",
    error,
    send,
  }
}

/**
 * The dock: OurSpaces' ActionDock, ported (its markup and CSS, house.css). The orb leads, with a
 * quiet prompt beside it; tap either and the orb lifts and swells, the utilities step out and the
 * say strip takes the bar. Until the voice stage (S16) the strip takes typed words: each key
 * stirs the orb. ✦ opens catch me up, which is also where questions are answered (plan F48);
 * the bubble is your chats; ♪ turns interface sounds on or off.
 */
export function Dock() {
  const spaceId = useCurrentSpaceId()
  const spaces = useSpaces()
  const spaceName = spaces.find((s) => s.id === spaceId)?.name ?? null
  const queryClient = useQueryClient()
  const { data: caught } = useCatchup(spaceId)
  // The badge counts what's new since you last looked; the panel lists everything.
  const waiting = caught?.fresh ?? 0
  const chat = usePanelChat(spaceId)
  const [panel, setPanel] = useState(false)
  const [tail, setTail] = useState(200)
  const ai = useRef<HTMLButtonElement>(null)
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
  const showPanel = useCallback(() => {
    const button = ai.current
    if (button) setTail(button.offsetLeft + button.offsetWidth / 2)
    setPanel(true)
  }, [])
  // "Ask" on a selection where no composer is on the page: the panel takes the quote (gap #2).
  const quote = useComposerQuote()
  useDockPresence()
  useEffect(() => {
    if (quote && !composerMounted()) showPanel()
  }, [quote, showPanel])
  const closePanel = useCallback(
    (seen: boolean) => {
      setPanel(false)
      setLitSources([])
      if (!composerMounted()) quoteInComposer(null)
      sound("tap")
      // What was shown is caught up: the next catch me up starts from now.
      if (seen)
        void fetch("/api/catchup", { method: "POST" }).then(() =>
          queryClient.invalidateQueries({ queryKey: ["catchup"] }),
        )
    },
    [queryClient],
  )
  // A question from the say strip is answered in the panel, in place (plan F48).
  const ask = () => {
    const question = text.trim()
    if (!question || chat.running) return
    sound("place")
    setText("")
    setMood("idle")
    showPanel()
    chat.send(question)
  }

  return (
    <nav className="action-dock" aria-label="Ask and catch up">
      {panel && (
        <CatchupPanel
          here={spaceId}
          spaceName={spaceName}
          tail={tail}
          chat={chat}
          onClose={closePanel}
        />
      )}
      <div className={`dock-voice is-${mood}`}>
        <button
          type="button"
          className="dock-voice-orb"
          onClick={open}
          title={mood === "idle" ? "Ask" : "Close"}
          aria-label={mood === "idle" ? "Ask" : "Close"}
        >
          <span className="voice-orb-host">
            {/* The orb works while the panel's answer does; the dock itself stays put. */}
            <VoiceOrb state={chat.running && mood === "idle" ? "working" : mood} level={level} />
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
      <button
        ref={ai}
        type="button"
        onClick={() => {
          if (panel) closePanel((caught?.lines.length ?? 0) > 0)
          else {
            sound("tap")
            showPanel()
          }
        }}
        className={`action-dock-ai relative${panel ? " is-active" : ""}`}
        aria-expanded={panel}
        title="Catch me up"
      >
        <span aria-hidden="true">✦</span>
        <b className="action-dock-label">catch me up</b>
        {waiting > 0 && !panel ? (
          <span
            className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-white text-[10px] font-extrabold text-ink tabular-nums"
            role="img"
            aria-label={`${waiting} new since you last looked`}
          >
            {waiting > 9 ? "9+" : waiting}
          </span>
        ) : null}
      </button>
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

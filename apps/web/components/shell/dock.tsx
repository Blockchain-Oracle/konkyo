"use client"

import { useChat } from "@ai-sdk/react"
import type { KonkyoMessage } from "@konkyo/agents"
import { SPACES } from "@konkyo/config"
import { useQueryClient } from "@tanstack/react-query"
import { DefaultChatTransport } from "ai"
import type { Route } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { OrbHint, orbHintWanted } from "@/components/voice/orb-hint"
import { useVoiceBuild } from "@/components/voice/voice-build"
import { type StageExample, useVoiceStage } from "@/components/voice/voice-stage"
import {
  composerMounted,
  type QuotedPassage,
  quoteInComposer,
  useComposerQuote,
  useDockPresence,
} from "@/lib/composer-draft"
import { api } from "@/lib/fetcher"
import { setLitSources } from "@/lib/lit-sources"
import { speakingLevel, useReading } from "@/lib/read-aloud"
import { keytermsFrom } from "@/lib/scribe"
import { interfaceSoundsOn, setInterfaceSounds, sound } from "@/lib/sounds"
import { useQuery } from "@/lib/use-query"
import {
  primeVoice,
  setNextVoiceScript,
  useVoice,
  type VoiceClip,
  type VoiceState,
} from "@/lib/voice"
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
export function usePanelChat(spaceId: string | null) {
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
  const { messages, sendMessage, status, error, stop } = useChat<KonkyoMessage>({
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
    stop,
  }
}

/**
 * Example asks for where you are (plan §16.5, "or tap one to hear it said"): the space's own
 * suggested questions (F16) and what voice can do there, each said by a real recorded voice
 * (made once by ElevenLabs, cached by its text) so the orb, waveform and words move to it.
 */
function useStageExamples(spaceId: string | null, spaceName: string | null, wanted: boolean) {
  const { data } = useQuery({
    queryKey: ["suggest", "panel", spaceId ?? "library"],
    queryFn: () =>
      api<{ questions: string[] }>("/api/suggest", {
        method: "POST",
        json: spaceId ? { folderIds: [spaceId] } : {},
      }),
    staleTime: 10 * 60_000,
  })
  const says = useMemo(() => {
    const questions = (data?.questions ?? []).slice(0, 2).map((q) => q.replace(/\?*$/, "?"))
    const name = spaceName?.toLowerCase()
    return [
      ...questions,
      name ? `quiz me on ${name}` : "catch me up",
      name ? `find papers on ${name}` : "make a space for my next essay",
    ].slice(0, 4)
  }, [data, spaceName])
  const clips = useQuery({
    queryKey: ["voice", "examples", says],
    enabled: wanted && says.length > 0,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: () =>
      Promise.all(
        says.map((say) =>
          api<{ url: string; words: Array<{ word: string; end: number }> }>("/api/voice/speak", {
            method: "POST",
            json: { text: say, voice: "asker" },
          })
            .then((clip): VoiceClip => ({ url: clip.url, words: clip.words }))
            .catch(() => null),
        ),
      ),
  })
  return useMemo<StageExample[]>(
    () => says.map((say, i) => ({ say, clip: clips.data?.[i] ?? null })),
    [says, clips.data],
  )
}

/**
 * The dock: OurSpaces' ActionDock, ported (its markup and CSS, house.css). The orb leads: tap it
 * and it lifts out of the dock into the voice stage (S16), where you talk and Konkyo builds what
 * you said (components/voice). The quiet "ask this space" beside it opens the say strip for typing
 * instead. ✦ opens catch me up, which is also where answers land (plan F48); the bubble is your
 * chats; ♪ turns interface sounds on or off.
 */
export function Dock() {
  const spaceId = useCurrentSpaceId()
  const spaces = useSpaces()
  const space = spaces.find((s) => s.id === spaceId) ?? null
  const spaceName = space?.name ?? null
  const queryClient = useQueryClient()
  const { data: caught } = useCatchup(spaceId)
  // The badge counts what's new since you last looked; the panel lists everything.
  const waiting = caught?.fresh ?? 0
  const chat = usePanelChat(spaceId)
  const [panel, setPanel] = useState(false)
  const [tail, setTail] = useState(200)
  const ai = useRef<HTMLButtonElement>(null)
  const [typing, setTyping] = useState(false)
  const [text, setText] = useState("")
  const [soundOn, setSoundOn] = useState(true)
  const input = useRef<HTMLInputElement>(null)
  const seat = useRef<HTMLButtonElement>(null)

  useEffect(() => setSoundOn(interfaceSoundsOn()), [])
  useEffect(() => {
    if (typing) input.current?.focus()
  }, [typing])

  const showPanel = useCallback(() => {
    const button = ai.current
    if (button) setTail(button.offsetLeft + button.offsetWidth / 2)
    setPanel(true)
  }, [])

  // ---- voice (S16): the orb hears you, the stage shows what it builds ----
  const voiceRef = useRef<ReturnType<typeof useVoice> | null>(null)
  const build = useVoiceBuild({
    spaceId,
    spaceName,
    spaces,
    chat,
    openPanel: showPanel,
    voice: () => voiceRef.current,
  })
  // Scribe leans towards the words of this library: space names and the newest sources' titles
  const keyterms = useMemo(
    () =>
      keytermsFrom([...(space?.recent.map((r) => r.title) ?? []), ...spaces.map((s) => s.name)]),
    [space, spaces],
  )
  const voice = useVoice(build.hooks, { keyterms })
  voiceRef.current = voice
  const [examplesWanted, setExamplesWanted] = useState(false)
  const examples = useStageExamples(spaceId, spaceName, examplesWanted)
  // the orb swells with Konkyo's own voice while it reads an answer aloud
  const orbLevel = useRef(0)
  useEffect(() => {
    let raf = 0
    const mix = () => {
      orbLevel.current = Math.max(voice.level.current ?? 0, speakingLevel.current)
      raf = requestAnimationFrame(mix)
    }
    raf = requestAnimationFrame(mix)
    return () => cancelAnimationFrame(raf)
  }, [voice.level])
  const lastAnswer = chat.messages.findLast((m) => m.role === "assistant")
  const reading = useReading(lastAnswer?.id)
  const color = space ? SPACES.colors[space.color].hex : "var(--color-violet)"
  const stage = useVoiceStage(voice, seat, {
    color,
    examples,
    onLanded: build.onLanded,
    orbLevel,
    orbState: reading
      ? "listening"
      : chat.running && voice.state === "idle"
        ? "working"
        : undefined,
  })
  const mood: VoiceState = stage.up ? "idle" : typing ? "listening" : voice.state

  const talk = () => {
    if (voice.state === "listening") {
      sound("tap")
      voice.finish("done")
      return
    }
    sound("promote")
    setTyping(false)
    setExamplesWanted(true)
    void voice.start()
    stage.open()
  }
  const [hint, setHint] = useState(false)
  useEffect(() => {
    const wanted = orbHintWanted()
    setHint(wanted)
    if (wanted) setExamplesWanted(true)
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
  // A typed question from the say strip is answered in the panel, in place (plan F48).
  const ask = () => {
    const question = text.trim()
    if (!question || chat.running) return
    sound("place")
    setText("")
    setTyping(false)
    showPanel()
    chat.send(question)
  }
  const said = voice.transcript.length > 46 ? `…${voice.transcript.slice(-45)}` : voice.transcript

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
      {hint && !stage.up && (
        <OrbHint
          spaceName={spaceName}
          starters={examples.slice(0, 3).map((e) => e.say)}
          onAsk={(words) => {
            // a starter is said by the same recorded voice as the stage's examples
            const clip = examples.find((e) => e.say === words)?.clip
            if (!clip) setNextVoiceScript(words)
            talk()
            if (clip) void voice.play(clip)
          }}
          onGone={() => setHint(false)}
        />
      )}
      <div className={`dock-voice is-${mood}`}>
        <button
          ref={seat}
          type="button"
          className="dock-voice-orb"
          onClick={talk}
          // a token is minted (and counted) only when a tap is on its way, never on a hover
          onPointerDown={primeVoice}
          title={voice.state === "listening" ? "Done talking" : "Talk to Konkyo"}
          aria-label={voice.state === "listening" ? "Done talking" : "Talk to Konkyo"}
        />
        {stage.layer}
        {mood === "idle" && (
          <button
            type="button"
            className="dock-voice-ask"
            onClick={() => {
              sound("tap")
              setTyping(true)
            }}
          >
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
            {typing ? (
              <input
                ref={input}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setTyping(false)
                    setText("")
                  }
                }}
                placeholder={spaceId ? "ask this space…" : "ask your library…"}
                aria-label="Your question"
                className="dock-voice-text w-[min(52vw,420px)] bg-transparent caret-lime outline-none placeholder:text-white/45"
              />
            ) : mood !== "idle" && said ? (
              <span className="dock-voice-text">{said}</span>
            ) : mood !== "idle" ? (
              <span className="dock-voice-listening">
                <i aria-hidden="true" />
                listening
              </span>
            ) : null}
            {typing && (
              <button type="submit" className="dock-voice-done" disabled={!text.trim()}>
                ask
              </button>
            )}
            {!typing && mood === "listening" && (
              <button type="button" className="dock-voice-done" onClick={talk}>
                done
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

"use client"

import type { KonkyoMessage } from "@konkyo/agents"
import type { FileKind } from "@konkyo/config"
import { cn } from "@konkyo/ui/lib/utils"
import { useQueryClient } from "@tanstack/react-query"
import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { type FormEvent, useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { AnswerText } from "@/components/chat/answer-text"
import { LitSource } from "@/components/chat/citation-chip"
import { ListenButton } from "@/components/voice/listen-button"
import type { Catchup, CatchupChip, CatchupLine } from "@/lib/catchup"
import {
  composerMounted,
  type QuotedPassage,
  quoteInComposer,
  useComposerQuote,
} from "@/lib/composer-draft"
import { api } from "@/lib/fetcher"
import { setLitSources } from "@/lib/lit-sources"
import { partsOf } from "@/lib/message-parts"
import { openFile } from "@/lib/preview"
import { qk } from "@/lib/query-keys"
import { useSpokenHighlight } from "@/lib/read-aloud"
import { sound } from "@/lib/sounds"
import { useQuery } from "@/lib/use-query"

/** OurSpaces' pacing (src/data/recap.ts): a line lands every 300 ms. */
const LINE_MS = 300

export function useCatchup(here: string | null) {
  return useQuery({
    queryKey: qk.catchup(here),
    queryFn: () => api<Catchup>(`/api/catchup${here ? `?here=${here}` : ""}`),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  })
}

/** "since 14:20", "since yesterday", "since Monday", or a first look's week. */
function sinceLabel(iso: string) {
  const at = new Date(iso)
  const now = new Date()
  const days = (now.getTime() - at.getTime()) / 86_400_000
  if (at.toDateString() === now.toDateString())
    return `since ${at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
  if (days < 2 && new Date(now.getTime() - 86_400_000).toDateString() === at.toDateString())
    return "since yesterday"
  if (days < 6.5)
    return `since ${at.toLocaleDateString("en-GB", { weekday: "long" }).toLowerCase()}`
  return "this past week"
}

type Chat = {
  messages: KonkyoMessage[]
  running: boolean
  error: Error | undefined
  send: (text: string, quote?: QuotedPassage) => void
  chatId: string
}

/**
 * Catch me up and the AI panel (plan F48 + F50): OurSpaces' recap panel, grown out of the dock.
 * What waits on you and what moved since you last closed it land one line at a time, each with
 * chips that take you there; below, ask your library (or the space you're in) and the answer
 * streams in with its citations, while the sources it reads ring lime on the wall behind.
 */
export function CatchupPanel({
  here,
  spaceName,
  tail,
  chat,
  onClose,
}: {
  here: string | null
  spaceName: string | null
  /** Where catch me up sits in the dock, for the panel's tail. */
  tail: number
  chat: Chat
  onClose: (seen: boolean) => void
}) {
  const router = useRouter()
  const { data, isPending } = useCatchup(here)
  const lines = data?.lines ?? []
  const [revealed, setRevealed] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState("")
  const panelRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const linesKey = lines.map((l) => l.id).join("|")
  // Lines land one at a time (OurSpaces' reveal); a reopen replays them.
  useEffect(() => {
    if (!linesKey) return
    setRevealed(0)
    const count = linesKey.split("|").length
    const timers = Array.from({ length: count }, (_, i) =>
      window.setTimeout(() => setRevealed(i + 1), i * LINE_MS),
    )
    return () => timers.forEach(window.clearTimeout)
  }, [linesKey])

  // The newest turn stays in view, as it grows part by part.
  const lastText = chat.messages.at(-1)?.parts.length ?? 0
  // biome-ignore lint/correctness/useExhaustiveDependencies: lastText re-runs it as the answer grows
  useEffect(() => {
    const body = bodyRef.current
    if (!body || !chat.messages.length) return
    body.scrollTo({ top: body.scrollHeight, behavior: chat.running ? "auto" : "smooth" })
  }, [chat.messages.length, lastText, chat.running])

  // Esc closes, as the × does.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose(lines.length > 0)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, lines.length])

  // FLIP the resize from the panel's anchored corner (OurSpaces' toggleExpanded).
  const toggleExpanded = () => {
    const panel = panelRef.current
    const first = panel?.getBoundingClientRect()
    flushSync(() => setExpanded((v) => !v))
    const last = panel?.getBoundingClientRect()
    sound("tap")
    if (!panel || !first || !last) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const sx = first.width / last.width
    const sy = first.height / last.height
    if (Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return
    panel.animate(
      [
        { transform: `scale(${sx}, ${sy})`, transformOrigin: "0 100%" },
        { transform: "scale(1, 1)", transformOrigin: "0 100%" },
      ],
      { duration: 320, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    )
  }

  const go = (chip: CatchupChip) => {
    sound("tap")
    if (chip.file) {
      openFile({ ...chip.file, kind: chip.file.kind as FileKind }, (href) =>
        router.push(href as Route),
      )
      return
    }
    if (chip.href) {
      onClose(true)
      router.push(chip.href as Route)
    }
  }

  // A passage chosen with "Ask" on a selection, when no composer is on the page.
  const shared = useComposerQuote()
  const quote = shared && !composerMounted() ? shared : null
  const ask = (text: string) => {
    const question = text.trim()
    if (!question || chat.running) return
    setDraft("")
    sound("place")
    chat.send(question, quote ?? undefined)
    if (quote) quoteInComposer(null)
  }
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    ask(draft)
  }

  const waiting = lines.filter((l) => l.waiting)
  const moved = lines.filter((l) => !l.waiting)
  const landed = revealed >= lines.length
  const showStarters = !isPending && landed && chat.messages.length === 0
  const lastAssistant = chat.messages.findLast((m) => m.role === "assistant")
  const thinking = chat.running && chat.messages.at(-1)?.role === "user"

  const asked = chat.messages.length > 0
  return (
    <div
      ref={panelRef}
      className={cn("recap-panel", expanded && "is-expanded")}
      style={{ "--recap-tail": `${tail}px` } as React.CSSProperties}
      role="dialog"
      aria-label="Catch me up"
    >
      <div className="recap-panel-head">
        <span className="recap-head-id">
          <span className="recap-badge" aria-hidden="true">
            ✦
          </span>
          {/* once you ask, the panel is about your question, not the week's digest */}
          <span className="recap-title">{asked ? "your question" : "what moved"}</span>
          {asked ? null : isPending ? (
            <span className="recap-since is-reading">
              <i aria-hidden="true" />
              reading your library
            </span>
          ) : data ? (
            <span className="recap-since">{sinceLabel(data.since)}</span>
          ) : null}
        </span>
        <span className="recap-panel-actions">
          <button
            type="button"
            className={cn("recap-expand", expanded && "is-active")}
            onClick={toggleExpanded}
            aria-label={expanded ? "Shrink the panel" : "Expand the panel"}
            title={expanded ? "shrink" : "expand"}
          >
            {expanded ? "⤡" : "⤢"}
          </button>
          <button
            type="button"
            className="recap-panel-close"
            onClick={() => onClose(lines.length > 0)}
            aria-label="Close"
          >
            ×
          </button>
        </span>
      </div>

      <div className="recap-body" ref={bodyRef}>
        {isPending ? (
          <div className="recap-thinking" role="status" aria-label="Reading your library">
            <span />
            <span />
            <span />
          </div>
        ) : lines.length === 0 ? (
          <p className="recap-empty">
            Nothing moved {data ? sinceLabel(data.since) : ""}: your library is as you left it.
          </p>
        ) : (
          <ol className="recap-list" aria-live="polite">
            {waiting.length > 0 && <li className="recap-kicker">waiting on you</li>}
            {waiting.map((line, i) => (
              <Line key={line.id} line={line} n={i + 1} shown={i < revealed} onChip={go} />
            ))}
            {moved.length > 0 && revealed > waiting.length && (
              <li className="recap-kicker">what moved</li>
            )}
            {moved.map((line, i) => (
              <Line
                key={line.id}
                line={line}
                n={waiting.length + i + 1}
                shown={waiting.length + i < revealed}
                onChip={go}
              />
            ))}
          </ol>
        )}

        {showStarters && <Starters here={here} onAsk={ask} />}

        {(chat.messages.length > 0 || chat.error) && (
          <ul className="recap-thread">
            {chat.messages.map((m) =>
              m.role === "user" ? (
                <li key={m.id} className="is-you">
                  <b>you</b>
                  {m.parts.map((p) =>
                    p.type === "data-quote" ? (
                      <span key="quote" className="recap-quote is-sent">
                        about “{p.data.text.slice(0, 120)}
                        {p.data.text.length > 120 ? "…" : ""}”
                      </span>
                    ) : null,
                  )}
                  <p>{m.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join(" ")}</p>
                </li>
              ) : (
                <li
                  key={m.id}
                  className={cn("is-recap", chat.running && m === lastAssistant && "is-live")}
                >
                  <span className="recap-spark" aria-hidden="true">
                    ✦
                  </span>
                  <PanelAnswer
                    message={m}
                    latest={m === lastAssistant}
                    running={chat.running && m === lastAssistant}
                    chatId={chat.chatId}
                    here={here}
                    spaceName={spaceName}
                  />
                </li>
              ),
            )}
            {thinking && (
              <li className="is-recap is-thinking">
                <span className="recap-spark" aria-hidden="true">
                  ✦
                </span>
                <p className="recap-typing" role="status" aria-label="Starting">
                  <span />
                  <span />
                  <span />
                </p>
              </li>
            )}
            {chat.error && !chat.running && (
              <li className="is-recap">
                <span className="recap-spark" aria-hidden="true">
                  ✦
                </span>
                <p>That didn't go through. Ask again.</p>
              </li>
            )}
          </ul>
        )}
      </div>

      {quote && (
        <div className="recap-quote">
          <span>
            about “{quote.text.slice(0, 160)}
            {quote.text.length > 160 ? "…" : ""}”
            <em>
              {quote.title}
              {quote.page ? ` · p. ${quote.page}` : ""}
            </em>
          </span>
          <button type="button" onClick={() => quoteInComposer(null)} aria-label="Remove the quote">
            ×
          </button>
        </div>
      )}
      <form className="recap-composer" onSubmit={onSubmit}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={
            quote ? "ask about this passage" : here ? "ask this space" : "ask your library"
          }
          aria-label={here ? "Ask this space" : "Ask your library"}
          disabled={chat.running}
          maxLength={500}
          // biome-ignore lint/a11y/noAutofocus: the panel opens to be asked, as OurSpaces' does
          autoFocus
        />
        <button type="submit" disabled={!draft.trim() || chat.running} aria-label="Ask">
          →
        </button>
      </form>
    </div>
  )
}

function Line({
  line,
  n,
  shown,
  onChip,
}: {
  line: CatchupLine
  n: number
  shown: boolean
  onChip: (chip: CatchupChip) => void
}) {
  if (!shown) return null
  return (
    <li>
      <span className="recap-num" aria-hidden="true">
        {String(n).padStart(2, "0")}
      </span>
      <div className="recap-line">
        <p>{line.text}</p>
        {line.chips.length > 0 && (
          <span className="recap-chips">
            {line.chips.map((chip) => (
              <button
                type="button"
                key={`${chip.label}-${chip.href ?? chip.file?.id}`}
                className="recap-chip"
                onClick={() => onChip(chip)}
              >
                <span className="max-w-[220px] truncate">{chip.label}</span>
                <i aria-hidden="true">↗</i>
              </button>
            ))}
          </span>
        )}
      </div>
    </li>
  )
}

/** Questions the space's (or library's) own sources answer (F16), until you ask your own. */
function Starters({ here, onAsk }: { here: string | null; onAsk: (q: string) => void }) {
  const { data } = useQuery({
    queryKey: ["suggest", "panel", here ?? "library"],
    queryFn: () =>
      api<{ questions: string[] }>("/api/suggest", {
        method: "POST",
        json: here ? { folderIds: [here] } : {},
      }),
    staleTime: 10 * 60_000,
  })
  const questions = data?.questions.slice(0, 3) ?? []
  if (!questions.length) return null
  return (
    <div className="recap-starters">
      {questions.map((q, i) => (
        <button
          type="button"
          key={q}
          className="recap-starter"
          style={{ "--i": i } as React.CSSProperties}
          onClick={() => onAsk(q)}
        >
          {q}
        </button>
      ))}
    </div>
  )
}

/**
 * One answer in the panel: the step it's on while it works, then the verified answer with its
 * citations, the sources it cites as chips, the receipt, and where to take it (the full chat, or
 * pinned to this space's wall).
 */
function PanelAnswer({
  message,
  latest,
  running,
  chatId,
  here,
  spaceName,
}: {
  message: KonkyoMessage
  latest: boolean
  running: boolean
  chatId: string
  here: string | null
  spaceName: string | null
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { steps, draft, sources, final, receipt, notFound, matrix } = partsOf(message)
  const [pin, setPin] = useState<"idle" | "pinning" | "pinned" | "failed">("idle")
  const runId = message.metadata?.runId
  // read aloud: the sentence being said is underlined in place
  const said = useRef<HTMLDivElement>(null)
  useSpokenHighlight(said, message.id)

  // The wall rings what the newest answer reads, then what it cites.
  const citedKey = final?.citations.map((c) => c.fileId).join("|")
  const readKey = sources.map((s) => s.fileId).join("|")
  useEffect(() => {
    if (!latest) return
    if (citedKey) setLitSources(citedKey.split("|"))
    else if (running && readKey) setLitSources(readKey.split("|"))
  }, [latest, running, citedKey, readKey])

  // The receipt lands with its sound (plan §16.5).
  const quotes = receipt?.quotes
  const announced = useRef(false)
  useEffect(() => {
    if (quotes !== undefined && running && !announced.current) {
      announced.current = true
      sound("check")
    }
  }, [quotes, running])

  const pinIt = async () => {
    if (!here || !runId || pin === "pinning" || pin === "pinned") return
    setPin("pinning")
    try {
      await api(`/api/spaces/${here}/pins`, { method: "POST", json: { runId } })
      setPin("pinned")
      sound("promote")
      void queryClient.invalidateQueries({ queryKey: qk.spaces.pins(here) })
    } catch {
      setPin("failed")
    }
  }

  if (notFound)
    return (
      <div className="recap-answer">
        <p>Your sources don't cover that, so nothing was guessed.</p>
        <div className="recap-answer-actions">
          <Link href={`/chats/${chatId}` as Route}>search further in the full chat ↗</Link>
        </div>
      </div>
    )

  const step = steps.findLast((s) => s.state === "running")
  const cited = final
    ? [...new Map(final.citations.map((c) => [c.fileId, c])).values()].slice(0, 4)
    : []

  return (
    <LitSource.Provider value={(fileId) => setLitSources(fileId ? [fileId] : [])}>
      <div className="recap-answer surface-sticker" ref={said}>
        {running && !final && step && (
          <span className="recap-answer-steps" role="status">
            <i aria-hidden="true" />
            {step.label.toLowerCase()}
          </span>
        )}
        {final ? (
          <AnswerText body={final.body} citations={final.citations} rewritten={final.rewritten} />
        ) : draft ? (
          <AnswerText body={draft} streaming />
        ) : null}
        {cited.length > 0 && (
          <span className="recap-chips">
            {cited.map((c) => (
              <button
                type="button"
                key={c.fileId}
                className="recap-chip"
                onClick={() =>
                  openFile({ id: c.fileId, title: c.title, kind: c.kind as FileKind }, (href) =>
                    router.push(href as Route),
                  )
                }
              >
                <span className="max-w-[200px] truncate">{c.title}</span>
                <i aria-hidden="true">↗</i>
              </button>
            ))}
          </span>
        )}
        {receipt && (
          <span className="recap-receipt">
            ✓ {receipt.quotes === 1 ? "1 quote" : `${receipt.quotes} quotes`} checked, word for word
          </span>
        )}
        {/* The agree/disagree matrix is too wide for the panel: it says what it found and links. */}
        {matrix?.state === "done" && matrix.claims.length > 0 && (
          <Link href={`/chats/${chatId}` as Route} className="recap-receipt underline">
            ⚖ where {matrix.counts.sources} sources agree and disagree on {matrix.counts.claims}{" "}
            {matrix.counts.claims === 1 ? "point" : "points"} ↗
          </Link>
        )}
        {!running && final && (
          <div className="recap-answer-actions">
            <ListenButton id={message.id} text={final.body} />
            <Link href={`/chats/${chatId}` as Route}>open the full chat ↗</Link>
            {here && runId && (
              <button
                type="button"
                onClick={pinIt}
                className={cn(pin === "pinned" && "is-done")}
                disabled={pin === "pinning"}
              >
                {pin === "pinned"
                  ? `pinned to ${spaceName?.toLowerCase() ?? "this space"} ✓`
                  : pin === "failed"
                    ? "couldn't pin, try again"
                    : `pin to ${spaceName?.toLowerCase() ?? "this space"}`}
              </button>
            )}
          </div>
        )}
      </div>
    </LitSource.Provider>
  )
}

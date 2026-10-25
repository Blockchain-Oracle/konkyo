"use client"

import { useChat } from "@ai-sdk/react"
import type { KonkyoMessage } from "@konkyo/agents"
import { PUBLIC, SPACES } from "@konkyo/config"
import { Button } from "@konkyo/ui/components/button"
import { DefaultChatTransport } from "ai"
import { ArrowUpIcon, RotateCcwIcon, SquareIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { BrandMark } from "@/components/brand-mark"
import { KindIcon } from "@/components/library/kind-icon"
import { RoomHeader } from "@/components/page-shell"
import { Workspace } from "@/components/source/workspace"
import { errorText } from "@/lib/format"
import { isSendKey } from "@/lib/keys"
import { openSource } from "@/lib/preview"
import type { openShare } from "@/lib/shares"
import { SourceAccessProvider } from "@/lib/source-access"
import { PublicAnswer } from "./public-answer"

export type PublicShare = Awaited<ReturnType<typeof openShare>>
type PublicFile = PublicShare["files"][number]

/** What a turn said, for the next question's context: the question, or the verified answer. */
function textOf(message: KonkyoMessage) {
  if (message.role === "user")
    return message.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n")
  const final = message.parts.find((p) => p.type === "data-final")
  return final?.type === "data-final" ? final.data.body : ""
}

const sizeOf = (f: PublicFile) =>
  f.pageCount
    ? `${f.pageCount} page${f.pageCount === 1 ? "" : "s"}`
    : f.durationSeconds
      ? `${Math.round(f.durationSeconds / 60)} min`
      : null

/** A source on the wall: a paper polaroid (page one, or its kind), opening read-only beside. */
function SourceCard({ file, i }: { file: PublicFile; i: number }) {
  return (
    <button
      type="button"
      onClick={() => openSource({ fileId: file.id, title: file.title, kind: file.kind })}
      className="public-source"
      style={{ rotate: `${[-1.6, 1.2, -0.8, 1.8][i % 4]}deg` }}
    >
      <span className="public-source-face">
        {file.thumbUrl ? (
          // biome-ignore lint/performance/noImgElement: same-origin page-one webp
          <img src={file.thumbUrl} alt="" loading="lazy" />
        ) : (
          <KindIcon kind={file.kind} className="size-7" />
        )}
      </span>
      <strong>{file.title}</strong>
      <small>{[file.byline, sizeOf(file)].filter(Boolean).join(" · ")}</small>
    </button>
  )
}

/**
 * A public folder (plan F36, §7.5 after Perplexity's Spaces): its name and sources, and a chat
 * that answers only from them with the same agents and checks as the owner's. Nothing here can
 * change the owner's library; files open read-only beside the answer.
 */
export function PublicFolder({ slug, share }: { slug: string; share: PublicShare }) {
  const access = useMemo(() => ({ api: `/api/public/${slug}`, owner: false }), [slug])
  return (
    <SourceAccessProvider value={access}>
      <Workspace>
        <PublicChat slug={slug} share={share} />
      </Workspace>
    </SourceAccessProvider>
  )
}

function PublicChat({ slug, share }: { slug: string; share: PublicShare }) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport<KonkyoMessage>({
        api: `/api/public/${slug}/chat`,
        // Nothing is stored for a visitor: the page sends the last few turns with each question.
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            message: messages.at(-1),
            history: messages
              .slice(0, -1)
              .map((m) => ({ role: m.role, text: textOf(m) }))
              .filter((h) => h.text)
              .slice(-PUBLIC.historyTurns * 2),
          },
        }),
      }),
    [slug],
  )
  const { messages, sendMessage, regenerate, status, error, stop } = useChat<KonkyoMessage>({
    transport,
  })
  const running = status === "submitted" || status === "streaming"
  const [text, setText] = useState("")
  const ask = (question: string) => {
    const q = question.trim()
    if (!q || running) return
    setText("")
    void sendMessage({ text: q })
  }

  const end = useRef<HTMLDivElement>(null)
  const last = messages.at(-1)
  // biome-ignore lint/correctness/useExhaustiveDependencies: follow the stream as parts arrive
  useEffect(() => {
    if (messages.length) end.current?.scrollIntoView({ block: "end", behavior: "smooth" })
  }, [messages.length, last?.parts.length])

  const count = share.files.length
  const wall =
    share.wall ?? SPACES.defaultWall[(share.color as keyof typeof SPACES.defaultWall) ?? "violet"]
  return (
    <div className={`paper-bg space-theme-${wall} flex min-h-svh flex-col`}>
      <div className="public-top">
        <Link href="/" className="room-pill hover:bg-ink">
          <BrandMark small className="size-4" />
          konkyo
        </Link>
        <span className="max-sm:hidden">
          <span className="room-pill">public space · read only</span>
        </span>
        <Link href="/sign-in" className="claim-done ml-auto whitespace-nowrap">
          <span className="max-sm:hidden">start your own library</span>
          <span className="sm:hidden">start yours</span> <span aria-hidden="true">↗</span>
        </Link>
      </div>

      <div className="mx-auto w-full max-w-[1100px] flex-1 px-4 pt-6 pb-16 md:px-8 md:pt-10">
        <RoomHeader
          title={share.name}
          kicker={
            <>
              {share.symbol ? `${share.symbol} ` : ""}
              <b>{count}</b> source{count === 1 ? "" : "s"}
            </>
          }
        />
        <p className="public-note">
          {share.description ||
            "Every answer here quotes these sources, and each quote is checked word for word before you see it."}
        </p>

        <ul className="public-sources" aria-label="Sources">
          {share.files.map((file, i) => (
            <li key={file.id}>
              <SourceCard file={file} i={i} />
            </li>
          ))}
        </ul>

        {messages.length > 0 && (
          <section className="public-thread surface-sticker" aria-label="Your questions">
            {messages.map((message, i) =>
              message.role === "user" ? (
                <div key={message.id} className="flex justify-end">
                  <p className="public-ask-bubble">{textOf(message)}</p>
                </div>
              ) : (
                <PublicAnswer
                  key={message.id}
                  message={message}
                  running={running && i === messages.length - 1}
                />
              ),
            )}
            {status === "submitted" && last?.role === "user" && (
              <p className="animate-checking text-snippet text-ash-gray">Starting…</p>
            )}
            {error && last?.role === "user" && (
              <div className="flex items-center gap-3 rounded-xl border border-contradicts/30 bg-contradicts/5 px-4 py-3">
                <p className="flex-1 text-snippet text-silver-mist">{errorText(error)}</p>
                <Button variant="secondary" size="sm" onClick={() => regenerate()}>
                  <RotateCcwIcon strokeWidth={1.75} />
                  Try again
                </Button>
              </div>
            )}
            <div ref={end} />
          </section>
        )}
      </div>

      {/* the dock's "ask", for a visitor: one black pill at the bottom of the room (beside an
          open source, not over it), answering from this space only */}
      <form
        className="public-dock"
        onSubmit={(e) => {
          e.preventDefault()
          ask(text)
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (isSendKey(e)) {
              e.preventDefault()
              ask(text)
            }
          }}
          placeholder={messages.length ? "ask a follow-up…" : `ask ${share.name.toLowerCase()}…`}
          aria-label="Your question"
          rows={1}
          maxLength={2000}
        />
        {running ? (
          <button
            type="button"
            className="public-dock-send"
            onClick={() => void stop()}
            aria-label="Stop"
          >
            <SquareIcon className="size-3 fill-current" strokeWidth={0} />
          </button>
        ) : (
          <button
            type="submit"
            className="public-dock-send"
            disabled={!text.trim()}
            aria-label="Ask"
          >
            <ArrowUpIcon className="size-4" strokeWidth={2.5} />
          </button>
        )}
      </form>
    </div>
  )
}

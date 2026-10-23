"use client"

import { useChat } from "@ai-sdk/react"
import type { KonkyoMessage } from "@konkyo/agents"
import { PUBLIC } from "@konkyo/config"
import { Button } from "@konkyo/ui/components/button"
import { Textarea } from "@konkyo/ui/components/textarea"
import { DefaultChatTransport } from "ai"
import { ArrowUpIcon, RotateCcwIcon, SquareIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { BrandMark } from "@/components/brand-mark"
import { KindIcon } from "@/components/library/kind-icon"
import { Workspace } from "@/components/source/workspace"
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

function errorText(error: Error) {
  try {
    return (JSON.parse(error.message) as { error?: string }).error ?? error.message
  } catch {
    return error.message
  }
}

const sizeOf = (f: PublicFile) =>
  f.pageCount
    ? `${f.pageCount} page${f.pageCount === 1 ? "" : "s"}`
    : f.durationSeconds
      ? `${Math.round(f.durationSeconds / 60)} min`
      : null

function SourceCard({ file }: { file: PublicFile }) {
  return (
    <button
      type="button"
      onClick={() => openSource({ fileId: file.id, title: file.title, kind: file.kind })}
      className="flex w-full items-start gap-3 rounded-xl border border-border bg-panel p-3.5 text-left transition-colors duration-(--duration-press) hover:border-line-strong hover:bg-raised"
    >
      <KindIcon kind={file.kind} className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">
        <span className="line-clamp-2 text-ui text-bone-white">{file.title}</span>
        <span className="mt-1 block truncate text-meta text-ash-gray">
          {[file.byline, sizeOf(file)].filter(Boolean).join(" · ")}
        </span>
      </span>
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
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/85 px-5 backdrop-blur-md">
        <Link href="/" className="flex items-center gap-2 text-ui text-bone-white">
          <BrandMark small className="size-5" />
          Konkyo
        </Link>
        <span className="hidden text-meta text-ash-gray sm:inline">Shared folder · read-only</span>
        <Button
          size="sm"
          variant="secondary"
          className="ml-auto"
          render={<Link href="/sign-in" />}
          nativeButton={false}
        >
          Start your own library
        </Button>
      </header>

      <div className="mx-auto w-full max-w-[46rem] flex-1 px-5 pt-10 pb-10 sm:px-6">
        <p className="text-micro text-saffron-spark uppercase">Shared folder</p>
        <h1 className="mt-3 text-heading-xs text-balance text-bone-white sm:text-subheading">
          {share.name}
        </h1>
        {share.description && (
          <p className="mt-3 text-reading text-pretty text-silver-mist">{share.description}</p>
        )}
        <p className="mt-3 text-snippet text-ash-gray">
          {count} source{count === 1 ? "" : "s"}. Every answer quotes them, and each quote is
          checked word for word before you see it.
        </p>

        {messages.length === 0 ? (
          <ul className="mt-8 grid gap-2.5 sm:grid-cols-2" aria-label="Sources">
            {share.files.map((file) => (
              <li key={file.id}>
                <SourceCard file={file} />
              </li>
            ))}
          </ul>
        ) : (
          <details className="group mt-6 rounded-xl border border-border bg-panel">
            <summary className="cursor-pointer list-none px-4 py-3 text-snippet text-silver-mist marker:hidden">
              The {count} source{count === 1 ? "" : "s"}
              <span className="ml-1 text-ash-gray group-open:hidden">· show</span>
            </summary>
            <ul className="grid gap-2 px-3 pb-3 sm:grid-cols-2">
              {share.files.map((file) => (
                <li key={file.id}>
                  <SourceCard file={file} />
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="mt-10 space-y-8">
          {messages.map((message, i) =>
            message.role === "user" ? (
              <div key={message.id} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl bg-raised px-4 py-2.5 text-reading whitespace-pre-wrap text-bone-white">
                  {textOf(message)}
                </p>
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
        </div>
      </div>

      <div className="sticky bottom-0 z-10 bg-gradient-to-t from-black from-60% to-transparent px-5 pt-6 pb-5 sm:px-6">
        <form
          className="mx-auto max-w-[46rem]"
          onSubmit={(e) => {
            e.preventDefault()
            ask(text)
          }}
        >
          <div className="relative rounded-card border border-input bg-panel focus-within:border-line-strong">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  ask(text)
                }
              }}
              placeholder={messages.length ? "Ask a follow-up…" : `Ask about ${share.name}…`}
              aria-label="Your question"
              rows={2}
              maxLength={2000}
              className="max-h-[40vh] min-h-16 resize-none border-0 bg-transparent px-4.5 pt-4 pr-14 text-reading shadow-none placeholder:text-ash-gray focus-visible:ring-0 dark:bg-transparent"
            />
            {running ? (
              <Button
                type="button"
                size="icon-sm"
                variant="secondary"
                onClick={() => void stop()}
                className="absolute right-3 bottom-3 rounded-full"
                aria-label="Stop"
              >
                <SquareIcon className="size-3 fill-current" strokeWidth={0} />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon-sm"
                variant={text.trim() ? "default" : "secondary"}
                disabled={!text.trim()}
                className="absolute right-3 bottom-3 rounded-full"
                aria-label="Ask"
              >
                <ArrowUpIcon strokeWidth={2} />
              </Button>
            )}
          </div>
        </form>
        <p className="mx-auto mt-2 max-w-[46rem] text-center text-meta text-ash-gray">
          Answers come only from this folder's sources.
        </p>
      </div>
    </div>
  )
}

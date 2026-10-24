"use client"

import { useChat } from "@ai-sdk/react"
import type { KonkyoMessage } from "@konkyo/agents"
import { Button } from "@konkyo/ui/components/button"
import { Sheet, SheetContent, SheetTitle } from "@konkyo/ui/components/sheet"
import { DefaultChatTransport } from "ai"
import { ArrowUpIcon, RotateCcwIcon, SquareIcon } from "lucide-react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useMemo, useState } from "react"
import { PublicAnswer } from "@/components/public/public-answer"
import type { PublicShare } from "@/components/public/public-folder"
import { closeAllSources, usePreview } from "@/lib/preview"
import { SourceAccessProvider } from "@/lib/source-access"

// The viewer (PDFium in a worker) loads only when a citation is opened.
const SourcePane = dynamic(
  () => import("@/components/source/source-pane").then((m) => m.SourcePane),
  { ssr: false },
)

/** Questions these three papers answer (each checked against them on testing). */
const SUGGESTED = [
  "Does a daytime nap help motor learning?",
  "What role do sleep spindles play in memory?",
  "Does sleep help memory the same way in older adults?",
]

function errorText(error: Error) {
  try {
    return (JSON.parse(error.message) as { error?: string }).error ?? error.message
  } catch {
    return error.message
  }
}

/**
 * The landing's live answer (plan §8 section 3): a real public folder (F36) asked from the page,
 * through the same route, agents and checks as any shared folder. No recording: what you see is
 * being planned, written and checked as you watch. Citations open the passage in a sheet.
 */
export function LiveAnswer({ slug, share }: { slug: string; share: PublicShare }) {
  const access = useMemo(() => ({ api: `/api/public/${slug}`, owner: false }), [slug])
  return (
    <SourceAccessProvider value={access}>
      <LiveChat slug={slug} share={share} />
      <SourceSheet />
    </SourceAccessProvider>
  )
}

function SourceSheet() {
  const { active } = usePreview()
  return (
    <Sheet open={Boolean(active)} onOpenChange={(open) => !open && closeAllSources()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="gap-0 border-l border-border p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[640px]"
      >
        <SheetTitle className="sr-only">Source</SheetTitle>
        {active && <SourcePane />}
      </SheetContent>
    </Sheet>
  )
}

function LiveChat({ slug, share }: { slug: string; share: PublicShare }) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport<KonkyoMessage>({
        api: `/api/public/${slug}/chat`,
        // One question at a time here: no history travels with it.
        prepareSendMessagesRequest: ({ messages }) => ({
          body: { message: messages.at(-1), history: [] },
        }),
      }),
    [slug],
  )
  const { messages, setMessages, sendMessage, regenerate, status, error, stop } =
    useChat<KonkyoMessage>({ transport })
  const running = status === "submitted" || status === "streaming"
  const [text, setText] = useState("")
  const ask = (question: string) => {
    const q = question.trim()
    if (!q || running) return
    setText("")
    // Only the newest question and its answer stay on the page.
    setMessages([])
    void sendMessage({ text: q })
  }
  const question = messages.find((m) => m.role === "user")
  const answer = messages.find((m) => m.role === "assistant")

  return (
    <div className="rounded-card border border-line-strong bg-black/70 p-5 backdrop-blur-sm sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-ui text-bone-white">{share.name}</p>
        <Link href={`/s/${slug}`} className="text-meta text-ash-gray hover:text-silver-mist">
          {share.files.length} open-access papers · open the folder
        </Link>
      </div>

      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault()
          ask(text)
        }}
      >
        <div className="relative rounded-xl border border-input bg-panel focus-within:border-line-strong">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ask these papers anything…"
            aria-label="Your question"
            maxLength={500}
            className="h-12 w-full rounded-xl bg-transparent pr-14 pl-4 text-reading text-bone-white outline-none placeholder:text-ash-gray"
          />
          {running ? (
            <Button
              type="button"
              size="icon-sm"
              variant="secondary"
              onClick={() => void stop()}
              className="absolute top-2.5 right-2.5"
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
              className="absolute top-2.5 right-2.5"
              aria-label="Ask"
            >
              <ArrowUpIcon strokeWidth={2} />
            </Button>
          )}
        </div>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTED.map((s) => (
          <button
            key={s}
            type="button"
            disabled={running}
            onClick={() => ask(s)}
            className="rounded-full border border-border px-3 py-1.5 text-snippet text-silver-mist transition-colors duration-(--duration-press) hover:border-line-strong hover:text-bone-white disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      {question && (
        <div className="mt-7 border-t border-border pt-6" aria-live="polite">
          <p className="text-snippet text-ash-gray">
            {question.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join(" ")}
          </p>
          <div className="mt-4">
            {answer ? (
              <PublicAnswer message={answer} running={running} />
            ) : (
              status === "submitted" && (
                <p className="animate-checking text-snippet text-ash-gray">Starting…</p>
              )
            )}
          </div>
          {error && (
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-contradicts/30 bg-contradicts/5 px-4 py-3">
              <p className="flex-1 text-snippet text-silver-mist">{errorText(error)}</p>
              <Button variant="secondary" size="sm" onClick={() => regenerate()}>
                <RotateCcwIcon strokeWidth={1.75} />
                Try again
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

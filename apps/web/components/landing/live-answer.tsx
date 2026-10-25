"use client"

// The answer, its citations and the source sheet are drawn with the app's sheets; the landing's own
// stylesheet leaves them out, so they come with this (lazily loaded) module.
import "@konkyo/ui/globals.css"
import { useChat } from "@ai-sdk/react"
import type { KonkyoMessage } from "@konkyo/agents"
import { Button } from "@konkyo/ui/components/button"
import { Sheet, SheetContent, SheetTitle } from "@konkyo/ui/components/sheet"
import { DefaultChatTransport } from "ai"
import { RotateCcwIcon } from "lucide-react"
import dynamic from "next/dynamic"
import { useEffect, useEffectEvent, useMemo, useState } from "react"
import { PublicAnswer } from "@/components/public/public-answer"
import type { PublicShare } from "@/components/public/public-folder"
import { errorText } from "@/lib/format"
import { closeAllSources, usePreview } from "@/lib/preview"
import { SourceAccessProvider } from "@/lib/source-access"
import { ASK_EVENT } from "./ask-event"
import { AskForm } from "./live-answer-parts"

// The viewer (PDFium in a worker) loads only when a citation is opened.
const SourcePane = dynamic(
  () => import("@/components/source/source-pane").then((m) => m.SourcePane),
  { ssr: false },
)

/**
 * The landing's live answer (plan §8 section 3): a real public folder (F36) asked from the page,
 * through the same route, agents and checks as any shared folder. No recording: what you see is
 * being planned, written and checked as you watch. Citations open the passage in a sheet. It sits
 * on the page's paper sheet (R4); the board above can hand it a question (ASK_EVENT). It loads
 * only when needed (live-answer-lazy.tsx), carrying over what was typed or asked before then.
 */
export function LiveAnswer({ slug, share, draft = "" }: LiveProps) {
  const access = useMemo(() => ({ api: `/api/public/${slug}`, owner: false }), [slug])
  return (
    <SourceAccessProvider value={access}>
      <LiveChat slug={slug} share={share} draft={draft} />
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

type LiveProps = {
  slug: string
  share: PublicShare
  /** What was typed in the box before the chat code arrived. */
  draft?: string
}

function LiveChat({ slug, share, draft = "" }: LiveProps) {
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
  const [text, setText] = useState(draft)
  const ask = (question: string) => {
    const q = question.trim()
    if (!q || running) return
    setText("")
    // Only the newest question and its answer stay on the page.
    setMessages([])
    void sendMessage({ text: q })
  }
  // A question picked on the board above (or asked before this code arrived: live-answer-lazy).
  const onAsk = useEffectEvent((e: Event) => ask((e as CustomEvent<string>).detail))
  useEffect(() => {
    window.addEventListener(ASK_EVENT, onAsk)
    return () => window.removeEventListener(ASK_EVENT, onAsk)
  }, [])
  const question = messages.find((m) => m.role === "user")
  const answer = messages.find((m) => m.role === "assistant")

  return (
    <div className="p-5 sm:p-8">
      <AskForm
        slug={slug}
        share={share}
        text={text}
        onText={setText}
        onAsk={ask}
        running={running}
        onStop={() => void stop()}
      />

      {question && (
        <div className="mt-7 border-t border-border pt-6" aria-live="polite">
          <p className="font-display text-[20px] leading-snug font-bold tracking-[-0.02em] text-ink">
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

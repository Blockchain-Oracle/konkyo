"use client"

import { useChat } from "@ai-sdk/react"
import type { KonkyoMessage } from "@konkyo/agents"
import { Button } from "@konkyo/ui/components/button"
import { useQueryClient } from "@tanstack/react-query"
import { DefaultChatTransport } from "ai"
import { RotateCcwIcon } from "lucide-react"
import { useEffect, useMemo, useRef } from "react"
import { Composer, type ComposerSubmit } from "@/components/composer"
import { peekQuestion, releaseQuestion } from "@/lib/pending-question"
import { AssistantMessage } from "./assistant-message"

type ChatScope = { fileIds?: string[]; folderIds?: string[] }

function UserMessage({ message }: { message: KonkyoMessage }) {
  const quote = message.parts.find((p) => p.type === "data-quote")
  const text = message.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n")
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl bg-raised px-4 py-2.5">
        {quote?.type === "data-quote" && (
          <blockquote className="mb-2 border-l-2 border-partly/70 pl-3 text-snippet text-ash-gray">
            <span className="line-clamp-3">“{quote.data.text}”</span>
            <span className="mt-1 block text-meta">
              {quote.data.title}
              {quote.data.page ? ` · p. ${quote.data.page}` : ""}
            </span>
          </blockquote>
        )}
        <p className="text-reading whitespace-pre-wrap text-bone-white">{text}</p>
      </div>
    </div>
  )
}

/**
 * One chat (plan F10–F15): questions and their verified answers, the composer below. A plain
 * chat sees the whole library; a chat started from a file or folder sees only that.
 */
export function ChatView({
  id,
  initialMessages,
  scope,
}: {
  id: string
  initialMessages: KonkyoMessage[]
  scope?: ChatScope
}) {
  const queryClient = useQueryClient()
  const scopeRef = useRef(scope)
  const transport = useMemo(
    () =>
      new DefaultChatTransport<KonkyoMessage>({
        api: "/api/chat",
        // The server keeps the history; only the new question travels.
        prepareSendMessagesRequest: ({ id: chatId, messages }) => ({
          body: { chatId, message: messages.at(-1), scope: scopeRef.current },
        }),
      }),
    [],
  )
  const { messages, sendMessage, status, stop, error, regenerate } = useChat<KonkyoMessage>({
    id,
    messages: initialMessages,
    transport,
    onFinish: () => void queryClient.invalidateQueries({ queryKey: ["chats"] }),
  })
  const running = status === "submitted" || status === "streaming"
  // Stop ends the run on the server (plan F15), not just this page's connection to it.
  const stopRun = () => {
    const runId = messages.findLast((m) => m.role === "assistant")?.metadata?.runId
    if (runId) void fetch(`/api/runs/${runId}/stop`, { method: "POST" })
    void stop()
  }

  const ask = ({ text, quote }: Pick<ComposerSubmit, "text" | "quote">) =>
    sendMessage({
      role: "user",
      parts: [
        ...(quote ? [{ type: "data-quote" as const, data: quote }] : []),
        { type: "text" as const, text },
      ],
    })

  // A question asked on Home arrives with the new chat and is sent once the view has settled:
  // a mount that is torn down at once (React's dev double-mount, a remount) cancels its timer
  // before anything is sent, so the question goes out exactly once.
  // biome-ignore lint/correctness/useExhaustiveDependencies: send the pending question on open
  useEffect(() => {
    const pending = peekQuestion(id)
    if (!pending || messages.length) return
    const timer = setTimeout(() => {
      releaseQuestion(id)
      void ask(pending)
    }, 0)
    return () => clearTimeout(timer)
  }, [id])

  // Keep the newest message in view while it streams.
  const end = useRef<HTMLDivElement>(null)
  const last = messages.at(-1)
  // biome-ignore lint/correctness/useExhaustiveDependencies: follow the stream as parts arrive
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" })
  }, [messages.length, last?.parts.length])

  return (
    <div className="flex min-h-[calc(100svh-3.5rem)] flex-col md:min-h-svh">
      <div className="mx-auto w-full max-w-[46rem] flex-1 space-y-8 px-6 pt-12 pb-10">
        {messages.map((message, i) =>
          message.role === "user" ? (
            <UserMessage key={message.id} message={message} />
          ) : (
            <AssistantMessage
              key={message.id}
              message={message}
              running={running && i === messages.length - 1}
            />
          ),
        )}
        {status === "submitted" && last?.role === "user" && (
          <p className="animate-checking text-snippet text-ash-gray">Starting…</p>
        )}
        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-contradicts/30 bg-contradicts/5 px-4 py-3">
            <p className="flex-1 text-snippet text-silver-mist">
              That answer didn't finish. {error.message}
            </p>
            <Button variant="secondary" size="sm" onClick={() => regenerate()}>
              <RotateCcwIcon strokeWidth={1.75} />
              Try again
            </Button>
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 bg-gradient-to-t from-black from-60% to-transparent px-6 pt-6 pb-4 md:bottom-0 md:pb-6">
        <Composer
          className="mx-auto max-w-[46rem]"
          placeholder="Ask a follow-up…"
          running={running}
          onStop={stopRun}
          onSubmit={ask}
        />
      </div>
    </div>
  )
}

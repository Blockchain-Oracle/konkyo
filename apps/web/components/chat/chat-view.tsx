"use client"

import { useChat } from "@ai-sdk/react"
import type { KonkyoMessage } from "@konkyo/agents"
import { Button } from "@konkyo/ui/components/button"
import { Textarea } from "@konkyo/ui/components/textarea"
import { cn } from "@konkyo/ui/lib/utils"
import { useQueryClient } from "@tanstack/react-query"
import { DefaultChatTransport } from "ai"
import { PencilIcon, RotateCcwIcon } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Composer, type ComposerSubmit } from "@/components/composer"
import { CitationTour } from "@/components/onboarding/citation-tour"
import { api } from "@/lib/fetcher"
import { type Focus, focusFromSearch, focusOf } from "@/lib/focus"
import { peekQuestion, releaseQuestion } from "@/lib/pending-question"
import { usePreview } from "@/lib/preview"
import { AssistantMessage } from "./assistant-message"
import { ChatStart } from "./chat-start"
import { ChatWall } from "./chat-wall"
import { LitSource } from "./citation-chip"

type ChatScope = { fileIds?: string[]; folderIds?: string[] }

function UserMessage({
  message,
  onEdit,
}: {
  message: KonkyoMessage
  /** Not while an answer is being written. */
  onEdit?: (text: string) => void
}) {
  const quote = message.parts.find((p) => p.type === "data-quote")
  const text = message.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n")
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)

  if (editing && onEdit) {
    return (
      <form
        className="ml-auto max-w-[85%]"
        onSubmit={(e) => {
          e.preventDefault()
          if (!draft.trim()) return
          setEditing(false)
          if (draft.trim() !== text) onEdit(draft.trim())
        }}
      >
        <Textarea
          autoFocus
          value={draft}
          rows={3}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false)
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              e.currentTarget.form?.requestSubmit()
            }
          }}
          aria-label="Edit your question"
          className="min-h-20 resize-none rounded-2xl bg-raised text-reading"
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          <span className="mr-auto text-meta text-ash-gray">
            The answers after it are replaced.
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!draft.trim()}>
            Ask again
          </Button>
        </div>
      </form>
    )
  }

  return (
    <div className="group flex items-start justify-end gap-1">
      {onEdit && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Edit your question"
          className="mt-1.5 text-ash-gray opacity-100 hover:text-bone-white md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100 [&_svg]:stroke-[1.5]"
          onClick={() => {
            setDraft(text)
            setEditing(true)
          }}
        >
          <PencilIcon />
        </Button>
      )}
      {/* Your words: OurSpaces' own-message bubble, lime with black text, its corner clipped. */}
      <div className="max-w-[85%] rounded-[20px_6px_20px_20px] bg-lime px-4.5 py-3 text-ink shadow-[0_4px_0_rgb(17_17_20/0.14)]">
        {quote?.type === "data-quote" && (
          <blockquote className="mb-2 border-l-2 border-ink/40 pl-3 text-snippet text-ink/80">
            <span className="line-clamp-3">“{quote.data.text}”</span>
            <span className="mt-1 block text-meta">
              {quote.data.title}
              {quote.data.page ? ` · p. ${quote.data.page}` : ""}
            </span>
          </blockquote>
        )}
        <p className="text-reading font-semibold whitespace-pre-wrap text-ink">{text}</p>
      </div>
    </div>
  )
}

/** The server's own words for a failed request (it answers `{ error }`), not the raw body. */
function errorText(error: Error) {
  try {
    return (JSON.parse(error.message) as { error?: string }).error ?? error.message
  } catch {
    return error.message
  }
}

/**
 * One chat (plan F10–F15): questions and their verified answers, the composer below. A plain
 * chat sees the whole library; a chat started from a file or folder sees only that.
 */
export function ChatView({
  id,
  initialMessages,
  scope,
  header,
}: {
  id: string
  initialMessages: KonkyoMessage[]
  scope?: ChatScope
  /** The room header (the chat's name and menu), set over the conversation. */
  header?: React.ReactNode
}) {
  const [lit, setLit] = useState<string | null>(null)
  const { active: sourceOpen } = usePreview()
  const queryClient = useQueryClient()
  const params = useSearchParams()
  // A saved chat keeps its focus; a new one takes it from Home or a "Chat with" link.
  const [focus, setFocus] = useState<Focus>(() =>
    scope ? focusOf(scope) : (peekQuestion(id)?.focus ?? focusFromSearch(params)),
  )
  // The transport reads the focus at send time.
  const scopeRef = useRef(focus)
  useEffect(() => {
    scopeRef.current = focus
  }, [focus])
  const transport = useMemo(
    () =>
      new DefaultChatTransport<KonkyoMessage>({
        api: "/api/chat",
        // The server keeps the history; only the new question travels.
        prepareSendMessagesRequest: ({ id: chatId, messages, trigger }) => ({
          body: { chatId, message: messages.at(-1), trigger, scope: scopeRef.current },
        }),
      }),
    [],
  )
  const { messages, sendMessage, setMessages, status, stop, error, regenerate } =
    useChat<KonkyoMessage>({
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

  /**
   * A deep search (plan F18): the worker runs it; the chat shows its message, which follows the
   * run's events. With a question (Deep search on), the question is saved first.
   */
  const startDeep = async (
    question: string,
    userMessage?: KonkyoMessage,
    intoFolderId?: string,
  ) => {
    if (userMessage) setMessages((prev) => [...prev, userMessage])
    try {
      const { message } = await api<{ message: KonkyoMessage }>("/api/deep", {
        method: "POST",
        json: {
          chatId: id,
          question,
          message: userMessage,
          scope: scopeRef.current,
          intoFolderId,
        },
      })
      setMessages((prev) => [...prev, message])
      void queryClient.invalidateQueries({ queryKey: ["chats"] })
    } catch (error) {
      if (userMessage) setMessages((prev) => prev.filter((m) => m.id !== userMessage.id))
      toast.error((error as Error).message)
    }
  }

  // A finished deep run's message now holds its verified answer: swap the saved copy in.
  const deepSettled = async (runId: string) => {
    const { message } = await api<{ message: KonkyoMessage | null }>(`/api/runs/${runId}/message`)
    if (message) setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)))
    void queryClient.invalidateQueries({ queryKey: ["chats"] })
  }

  const ask = ({
    text,
    quote,
    deep,
    intoFolderId,
  }: Pick<ComposerSubmit, "text" | "quote"> & { deep?: boolean; intoFolderId?: string }) => {
    const parts: KonkyoMessage["parts"] = [
      ...(quote ? [{ type: "data-quote" as const, data: quote }] : []),
      { type: "text" as const, text },
    ]
    if (deep) return startDeep(text, { id: crypto.randomUUID(), role: "user", parts }, intoFolderId)
    return sendMessage({ role: "user", parts })
  }

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
    <LitSource.Provider value={setLit}>
      {/* The conversation on paper; beside it, while there's room, the wall of what it quotes. */}
      <div
        className={cn(
          "mx-auto grid w-full max-w-[1400px] gap-x-9 px-4 pt-4 md:px-8 md:pt-[92px]",
          !sourceOpen && "xl:grid-cols-[minmax(0,1fr)_minmax(270px,330px)]",
        )}
      >
        <div className="min-w-0">
          <CitationTour />
          {header}
          <section
            aria-label="Conversation"
            className="surface-paper paper-sheet flex min-h-[calc(100svh-260px)] flex-col p-0!"
          >
            <div className="flex-1 space-y-9 px-[clamp(18px,3.2vw,52px)] pt-[clamp(22px,3vw,44px)] pb-10">
              {!messages.length && !peekQuestion(id) && (
                <ChatStart focus={focus} onAsk={(text) => void ask({ text })} />
              )}
              {messages.map((message, i) =>
                message.role === "user" ? (
                  <UserMessage
                    key={message.id}
                    message={message}
                    onEdit={
                      running
                        ? undefined
                        : (text) =>
                            void sendMessage({
                              messageId: message.id,
                              role: "user",
                              parts: [
                                ...message.parts.filter((p) => p.type === "data-quote"),
                                { type: "text" as const, text },
                              ],
                            })
                    }
                  />
                ) : (
                  <AssistantMessage
                    key={message.id}
                    message={message}
                    running={running && i === messages.length - 1}
                    onRegenerate={
                      i === messages.length - 1 && !running
                        ? () => void regenerate({ messageId: message.id })
                        : undefined
                    }
                    onFindSources={
                      i === messages.length - 1 && !running
                        ? () => {
                            const notFound = message.parts.find((p) => p.type === "data-notFound")
                            const asked = messages[i - 1]?.parts.flatMap((p) =>
                              p.type === "text" ? [p.text] : [],
                            )
                            void startDeep(
                              notFound?.type === "data-notFound"
                                ? notFound.data.question
                                : (asked?.join(" ") ?? ""),
                            )
                          }
                        : undefined
                    }
                    question={messages[i - 1]?.parts
                      .flatMap((p) => (p.type === "text" ? [p.text] : []))
                      .join(" ")}
                    onDeepSettled={deepSettled}
                    onDeepRetry={(question) => void startDeep(question)}
                  />
                ),
              )}
              {status === "submitted" && last?.role === "user" && (
                <p className="animate-checking text-snippet text-ash-gray">Starting…</p>
              )}
              {/* An answer that started says so itself; this is for one that never started. */}
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
            {/* The ask box rides the bottom of the sheet; on phones it clears the bottom bar. */}
            <div className="sticky bottom-[calc(92px+env(safe-area-inset-bottom))] z-10 rounded-b-[inherit] bg-gradient-to-t from-paper-card from-65% to-transparent px-[clamp(14px,2.6vw,44px)] pt-8 pb-5 min-[801px]:bottom-0">
              <Composer
                placeholder={messages.length ? "Ask a follow-up…" : "Ask your library…"}
                focus={focus}
                onFocusChange={setFocus}
                running={running}
                onStop={stopRun}
                onSubmit={ask}
              />
            </div>
          </section>
        </div>
        {!sourceOpen && (
          <div className="hidden xl:block">
            <div className="sticky top-[92px] max-h-[calc(100svh-120px)] overflow-y-auto px-3 pt-2 pb-28 [scrollbar-width:none]">
              <ChatWall messages={messages} running={running} lit={lit} />
            </div>
          </div>
        )}
      </div>
    </LitSource.Provider>
  )
}

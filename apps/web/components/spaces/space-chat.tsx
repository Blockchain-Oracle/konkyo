"use client"

/*
 * The space chat, in OurSpaces' chat panel (https://github.com/thomasnguyen/ourspaces-app,
 * src/components/GlobalChatPanel.tsx and ThreadContent.tsx; MIT, Copyright (c) 2026 Thomas
 * Nguyen). Konkyo adds "@konkyo …": the ask goes in the thread, and Konkyo's one verified answer
 * posts for everyone, its steps live, with Stop and pin (plan F56).
 */

import type { Citation } from "@konkyo/agents"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { BrandMark } from "@/components/brand-mark"
import { AnswerText } from "@/components/chat/answer-text"
import { MemberFace } from "@/components/people/member-face"
import { api } from "@/lib/fetcher"
import { qk } from "@/lib/query-keys"
import { sound } from "@/lib/sounds"
import type { SpaceMessage } from "@/lib/space-chat"
import { useQuery } from "@/lib/use-query"

const time = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", hour12: false })

export const spaceMessagesKey = (spaceId: string) => ["space-messages", spaceId] as const

export function SpaceChat({ spaceId, name }: { spaceId: string; name: string }) {
  const [open, setOpen] = useState(false)
  const { data } = useQuery({
    queryKey: spaceMessagesKey(spaceId),
    queryFn: () =>
      api<{ messages: SpaceMessage[] }>(`/api/spaces/${spaceId}/messages`).then((r) => r.messages),
  })
  const count = data?.length ?? 0
  if (!open)
    return (
      <button
        type="button"
        className="global-chat-tab"
        onClick={() => {
          sound("tap")
          setOpen(true)
        }}
        aria-label="Open the space chat"
      >
        <span className="global-chat-tab-label">space chat</span>
        {count > 0 && <span className="global-chat-tab-count">{count > 99 ? "99" : count}</span>}
      </button>
    )
  return (
    <aside className="global-chat-panel space-chat" aria-label="Space chat">
      <header className="global-chat-header">
        <div>
          <span className="global-chat-kicker">space chat</span>
          <h2>{name}</h2>
        </div>
        <button
          type="button"
          className="global-chat-close"
          onClick={() => setOpen(false)}
          aria-label="Close the space chat"
        >
          →
        </button>
      </header>
      <p className="global-chat-context">
        everyone here sees this · start with @konkyo to ask the space
      </p>
      <Thread spaceId={spaceId} messages={data} />
    </aside>
  )
}

function Thread({ spaceId, messages }: { spaceId: string; messages: SpaceMessage[] | undefined }) {
  const queryClient = useQueryClient()
  const [text, setText] = useState("")
  const list = useRef<HTMLOListElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const refresh = () => void queryClient.invalidateQueries({ queryKey: spaceMessagesKey(spaceId) })

  // newest at the bottom, in view
  useEffect(() => {
    const el = list.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages?.length, messages?.at(-1)?.status])

  const send = useMutation({
    mutationFn: (body: string) =>
      api(`/api/spaces/${spaceId}/messages`, {
        method: "POST",
        json: { id: crypto.randomUUID(), body },
      }),
    onSuccess: () => {
      sound("place")
      refresh()
    },
    onError: (error: Error, body) => {
      setText(body)
      toast.error(error.message)
    },
  })

  return (
    <div className="thread-content">
      <ol ref={list} className="thread-message-list" aria-live="polite">
        {messages?.length ? (
          messages.map((m) =>
            m.kind === "answer" ? (
              <KonkyoAnswer key={m.id} spaceId={spaceId} message={m} onChange={refresh} />
            ) : (
              <li key={m.id} className={`thread-message${m.kind === "ask" ? " is-ask" : ""}`}>
                <div className="thread-message-author">
                  {m.author && <MemberFace face={m.author.face} size="xs" />}
                  <strong>{m.mine ? "you" : (m.author?.name ?? "someone")}</strong>
                  <span>{time.format(new Date(m.createdAt))}</span>
                </div>
                <p>
                  {m.kind === "ask" ? (
                    <>
                      <span className="space-chat-at">@konkyo</span>{" "}
                      {m.body.replace(/^@konkyo\b[\s,:]*/i, "")}
                    </>
                  ) : (
                    m.body
                  )}
                </p>
              </li>
            ),
          )
        ) : (
          <li className="thread-empty">
            <span aria-hidden="true">✦</span>
            <strong>start the conversation</strong>
            <p>say hi, or ask the space: @konkyo where do these papers disagree?</p>
          </li>
        )}
      </ol>
      <form
        className="thread-composer"
        onSubmit={(event) => {
          event.preventDefault()
          const body = text.trim()
          if (!body || send.isPending) return
          setText("")
          send.mutate(body)
        }}
      >
        {!text && (
          <button
            type="button"
            className="space-chat-at-button"
            onClick={() => {
              setText("@konkyo ")
              input.current?.focus()
            }}
            aria-label="Ask Konkyo"
          >
            @
          </button>
        )}
        <input
          ref={input}
          value={text}
          maxLength={2000}
          onChange={(event) => setText(event.target.value)}
          placeholder="say something, or @konkyo ask…"
          aria-label="Message the space"
        />
        <button type="submit" aria-label="Send" disabled={!text.trim() || send.isPending}>
          ↑
        </button>
      </form>
    </div>
  )
}

/** Konkyo's answer in the thread: its steps while it works, then the checked answer. */
function KonkyoAnswer({
  spaceId,
  message,
  onChange,
}: {
  spaceId: string
  message: SpaceMessage
  onChange: () => void
}) {
  const queryClient = useQueryClient()
  const stop = useMutation({
    mutationFn: () => api(`/api/spaces/${spaceId}/messages/${message.id}/stop`, { method: "POST" }),
    onSuccess: onChange,
    onError: (error: Error) => toast.error(error.message),
  })
  const pin = useMutation({
    mutationFn: () => api(`/api/spaces/${spaceId}/messages/${message.id}/pin`, { method: "POST" }),
    onSuccess: () => {
      sound("promote")
      toast.success("Pinned to the wall")
      onChange()
      void queryClient.invalidateQueries({ queryKey: qk.spaces.pins(spaceId) })
    },
    onError: (error: Error) => toast.error(error.message),
  })
  const parts = message.parts
  const final = parts?.final
  const citations: Citation[] = (final?.citations ?? []).map((c) => ({
    ...c,
    label: `m${c.n}`,
    text: c.quote,
    state: "verified" as const,
  }))
  return (
    <li className="thread-message space-chat-answer">
      <div className="thread-message-author">
        <span className="space-chat-mark" aria-hidden="true">
          <BrandMark small className="size-3.5" />
        </span>
        <strong>konkyo</strong>
        <span>
          {message.asker ? `for ${message.asker.toLowerCase()} · ` : ""}
          {time.format(new Date(message.createdAt))}
        </span>
      </div>
      {message.status === "answering" && (
        <div className="space-chat-steps">
          <ul>
            {(parts?.steps.length
              ? parts.steps
              : [{ id: "start", label: "Reading the question", state: "running" as const }]
            ).map((step) => (
              <li key={step.id} className={`is-${step.state}`}>
                <i aria-hidden="true" />
                {step.label}
              </li>
            ))}
          </ul>
          {message.canStop && (
            <button type="button" onClick={() => stop.mutate()} disabled={stop.isPending}>
              stop
            </button>
          )}
        </div>
      )}
      {message.status === "answered" && final && (
        <div className="space-chat-final">
          <AnswerText body={final.body} citations={citations} />
          <div className="space-chat-foot">
            <span className="space-chat-receipt">
              ✓ {parts?.quotes === 1 ? "1 quote" : `${parts?.quotes ?? citations.length} quotes`}{" "}
              checked
            </span>
            {message.pinned ? (
              <span className="space-chat-pinned">pinned ✓</span>
            ) : (
              <button type="button" onClick={() => pin.mutate()} disabled={pin.isPending}>
                pin to the wall
              </button>
            )}
          </div>
        </div>
      )}
      {(message.status === "not-found" || (message.status === "answered" && !final)) && (
        <p className="space-chat-note">This space&apos;s sources don&apos;t cover that.</p>
      )}
      {message.status === "stopped" && <p className="space-chat-note">Stopped.</p>}
      {message.status === "failed" && (
        <p className="space-chat-note">Couldn&apos;t answer that just now. Ask again.</p>
      )}
    </li>
  )
}

"use client"

import { Button } from "@konkyo/ui/components/button"
import { Input } from "@konkyo/ui/components/input"
import { Skeleton } from "@konkyo/ui/components/skeleton"
import type { Route } from "next"
import Link from "next/link"
import { useMemo, useState } from "react"
import { ChatMenu } from "@/components/chat/chat-menu"
import { EmptyState } from "@/components/empty-state"
import { sortChats, useChats } from "@/lib/use-chats"

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
function ago(iso: string) {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000)
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute")
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return relative.format(hours, "hour")
  return relative.format(Math.round(hours / 24), "day")
}

/** Every chat (plan F17): pinned first, then by last activity; search by name. */
export function ChatsList() {
  const { data: chats, isPending } = useChats()
  const [query, setQuery] = useState("")
  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    const all = sortChats(chats ?? [])
    return words.length
      ? all.filter((c) => words.every((w) => c.title.toLowerCase().includes(w)))
      : all
  }, [chats, query])

  if (isPending) {
    return (
      <ul className="mt-9 space-y-2" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </ul>
    )
  }
  if (!chats?.length) {
    return (
      <div className="mt-15">
        <EmptyState
          label="Chats"
          title="No chats yet"
          description="Ask a question on Home. Every chat is saved here, with the sources it used."
        >
          <Button render={<Link href="/home" />} nativeButton={false} variant="secondary">
            Ask a question
          </Button>
        </EmptyState>
      </div>
    )
  }
  return (
    <>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="search your chats…"
        aria-label="Search chats"
        className="h-11 rounded-full px-4.5"
      />
      <ul className="mt-4.5 border-t border-border">
        {shown.map((chat) => (
          <li
            key={chat.id}
            className="relative flex min-h-16 items-center gap-3 border-b border-border px-2 py-3 transition-colors duration-(--duration-press) hover:bg-accent"
          >
            <div className="min-w-0 flex-1">
              <Link
                href={`/chats/${chat.id}` as Route}
                className="block truncate font-display text-[17px] font-extrabold tracking-[-0.015em] text-bone-white after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
              >
                {chat.title}
              </Link>
              <p className="mt-0.5 text-meta text-ash-gray">{ago(chat.updatedAt)}</p>
            </div>
            {chat.pinnedAt && (
              <span className="shrink-0 rounded-full bg-sticker px-2.5 py-1 text-[11.5px] font-bold text-white">
                pinned
              </span>
            )}
            <ChatMenu chat={chat} />
          </li>
        ))}
      </ul>
      {!shown.length && <p className="mt-9 text-ui text-ash-gray">No chat called that.</p>}
    </>
  )
}

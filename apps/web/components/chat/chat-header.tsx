"use client"

import { useChats } from "@/lib/use-chats"
import { ChatMenu } from "./chat-menu"

/**
 * The chat's name and its menu, as a room header over the conversation: a black kicker
 * pill, the question itself in the wall's ink. The list is the live copy, so a rename or pin shows
 * here at once; a chat whose first answer is still being written is "new chat" until it's saved.
 */
export function ChatHeader({
  id,
  initial,
}: {
  id: string
  initial?: { id: string; title: string; pinnedAt: string | null }
}) {
  const { data } = useChats()
  const chat = data?.find((c) => c.id === id) ?? initial
  const title = chat?.title ?? "new chat"
  return (
    <header className="room-header is-compact">
      <div className="space-title-block">
        <span className="room-pill">{chat?.pinnedAt ? "pinned chat" : "chat"}</span>
        <div className="space-title-row">
          <h1>
            <span className="space-title-text">{title}</span>
          </h1>
        </div>
      </div>
      {chat ? (
        <div className="space-header-side">
          <div className="header-actions">
            <ChatMenu chat={chat} leaveOnDelete sticker />
          </div>
        </div>
      ) : null}
    </header>
  )
}

"use client"

import { MobileHeader } from "@/components/page-header"
import { useChats } from "@/lib/use-chats"
import { ChatMenu } from "./chat-menu"

/**
 * The chat's name and its menu (plan F17). The list is the live copy, so a rename or pin shows
 * here at once; a chat whose first answer is still being written is "New chat" until it is saved.
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
  const title = chat?.title ?? "New chat"
  const menu = chat && <ChatMenu chat={chat} leaveOnDelete />
  return (
    <>
      <MobileHeader title={title}>{menu}</MobileHeader>
      <header className="sticky top-0 z-30 hidden h-12 items-center gap-2 bg-gradient-to-b from-black from-55% to-transparent px-4 md:flex">
        <h1 className="min-w-0 flex-1 truncate text-ui text-silver-mist">{title}</h1>
        {menu}
      </header>
    </>
  )
}

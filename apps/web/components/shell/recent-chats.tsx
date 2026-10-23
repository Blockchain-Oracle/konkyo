"use client"

import {
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@konkyo/ui/components/sidebar"
import { PinIcon } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { sortChats, useChats } from "@/lib/use-chats"

const SHOWN = 5

/** Under "Chats" in the sidebar (plan §7.3): pinned chats, then the most recent ones. */
export function RecentChats() {
  const { data: chats } = useChats()
  const pathname = usePathname()
  if (!chats?.length) return null
  const sorted = sortChats(chats)
  const shown = [...sorted.filter((c) => c.pinnedAt), ...sorted.filter((c) => !c.pinnedAt)].slice(
    0,
    Math.max(SHOWN, sorted.filter((c) => c.pinnedAt).length),
  )
  return (
    <SidebarMenuSub className="mr-0 group-data-[collapsible=icon]:hidden">
      {shown.map((chat) => (
        <SidebarMenuSubItem key={chat.id}>
          <SidebarMenuSubButton
            isActive={pathname === `/chats/${chat.id}`}
            render={<Link href={`/chats/${chat.id}` as Route} />}
            className="text-snippet text-ash-gray data-active:text-bone-white"
          >
            <span className="truncate">{chat.title}</span>
            {chat.pinnedAt && (
              <PinIcon className="ml-auto size-3 shrink-0 opacity-60" strokeWidth={1.75} />
            )}
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      ))}
    </SidebarMenuSub>
  )
}

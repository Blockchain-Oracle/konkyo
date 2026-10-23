import type { Metadata } from "next"
import { PageShell } from "@/components/page-shell"
import { ChatsList } from "./chats-list"

export const metadata: Metadata = { title: "Chats" }

export default function ChatsPage() {
  return (
    <PageShell title="Chats">
      <ChatsList />
    </PageShell>
  )
}

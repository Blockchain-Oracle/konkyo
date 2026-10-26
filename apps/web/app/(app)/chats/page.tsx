import type { Metadata } from "next"
import { PageShell } from "@/components/page-shell"
import { ChatsList } from "./chats-list"
import { NewChatButton } from "./new-chat-button"

export const metadata: Metadata = { title: "Chats" }

export default function ChatsPage() {
  return (
    <PageShell title="Chats" actions={<NewChatButton />}>
      <ChatsList />
    </PageShell>
  )
}

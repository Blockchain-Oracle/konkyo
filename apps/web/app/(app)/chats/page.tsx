import { Button } from "@konkyo/ui/components/button"
import type { Metadata } from "next"
import Link from "next/link"
import { EmptyState } from "@/components/empty-state"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = { title: "Chats" }

export default function ChatsPage() {
  return (
    <PageShell title="Chats">
      <EmptyState
        label="Chats"
        title="No chats yet"
        description="Ask a question on Home. Every chat is saved here, with the sources it used."
      >
        <Button render={<Link href="/home" />} nativeButton={false} variant="secondary">
          Ask a question
        </Button>
      </EmptyState>
    </PageShell>
  )
}

import type { Metadata } from "next"
import { EmptyState } from "@/components/empty-state"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = { title: "Inbox" }

export default function InboxPage() {
  return (
    <PageShell title="Inbox">
      <EmptyState
        label="Inbox"
        title="Nothing new"
        description="New sources from your watches, review reminders and finished agent runs arrive here."
      />
    </PageShell>
  )
}

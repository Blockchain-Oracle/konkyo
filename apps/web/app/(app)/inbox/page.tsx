import type { Metadata } from "next"
import { InboxView } from "@/components/inbox/inbox-view"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = { title: "Inbox" }

export default function InboxPage() {
  return (
    <PageShell title="Inbox">
      <InboxView />
    </PageShell>
  )
}

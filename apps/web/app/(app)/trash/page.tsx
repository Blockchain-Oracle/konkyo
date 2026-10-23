import type { Metadata } from "next"
import { EmptyState } from "@/components/empty-state"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = { title: "Trash" }

export default function TrashPage() {
  return (
    <PageShell title="Trash">
      <EmptyState
        label="Trash"
        title="Trash is empty"
        description="Deleted files, folders, chats and notes stay here for 30 days before they're gone for good."
      />
    </PageShell>
  )
}

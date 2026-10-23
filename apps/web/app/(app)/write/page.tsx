import type { Metadata } from "next"
import { EmptyState } from "@/components/empty-state"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = { title: "Write" }

export default function WritePage() {
  return (
    <PageShell title="Write">
      <EmptyState
        label="Write"
        title="No notes yet"
        description="Write with your library beside you. Suggestions cite only passages that exist in it."
      />
    </PageShell>
  )
}

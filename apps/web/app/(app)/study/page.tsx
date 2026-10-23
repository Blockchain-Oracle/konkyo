import type { Metadata } from "next"
import { EmptyState } from "@/components/empty-state"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = { title: "Study" }

export default function StudyPage() {
  return (
    <PageShell title="Study">
      <EmptyState
        label="Study"
        title="Nothing to practise yet"
        description="Make practice from any file or folder. You answer first; the passage it came from follows."
      />
    </PageShell>
  )
}

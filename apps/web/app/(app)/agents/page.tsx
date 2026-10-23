import type { Metadata } from "next"
import { EmptyState } from "@/components/empty-state"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = { title: "Agents" }

export default function AgentsPage() {
  return (
    <PageShell title="Agents">
      <EmptyState
        label="Agents"
        title="No agents yet"
        description="Agents run standing tasks for you, like watching for new papers on a topic or quizzing you every Monday."
      />
    </PageShell>
  )
}

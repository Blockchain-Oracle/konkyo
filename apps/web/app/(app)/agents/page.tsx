import type { Metadata } from "next"
import { Suspense } from "react"
import { AgentsView } from "@/components/agents/agents-view"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = { title: "Agents" }

export default function AgentsPage() {
  return (
    <PageShell title="agents" bare>
      <Suspense>
        <AgentsView />
      </Suspense>
    </PageShell>
  )
}

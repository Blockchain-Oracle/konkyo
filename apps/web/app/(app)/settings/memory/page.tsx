import type { Metadata } from "next"
import { PageShell } from "@/components/page-shell"
import { MemoryView } from "./memory-view"

export const metadata: Metadata = { title: "Memory" }

export default function MemoryPage() {
  return (
    <PageShell title="Memory">
      <MemoryView />
    </PageShell>
  )
}

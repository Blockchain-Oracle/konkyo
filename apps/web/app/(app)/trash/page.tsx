import type { Metadata } from "next"
import { PageShell } from "@/components/page-shell"
import { TrashView } from "./trash-view"

export const metadata: Metadata = { title: "Trash" }

export default function TrashPage() {
  return (
    <PageShell title="Trash">
      <TrashView />
    </PageShell>
  )
}

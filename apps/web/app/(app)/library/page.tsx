import type { Metadata } from "next"
import { EmptyState } from "@/components/empty-state"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = { title: "Library" }

export default function LibraryPage() {
  return (
    <PageShell title="Library">
      <EmptyState
        label="Library"
        title="Your library is empty"
        description="Drop files or a whole folder anywhere, import a paper by URL or DOI, or connect Google Drive. Every file is read, checked and ready to cite."
      />
    </PageShell>
  )
}

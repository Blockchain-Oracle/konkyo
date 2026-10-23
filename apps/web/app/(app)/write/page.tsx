import type { Metadata } from "next"
import { PageShell } from "@/components/page-shell"
import { NotesList } from "./notes-list"

export const metadata: Metadata = { title: "Write" }

export default function WritePage() {
  return (
    <PageShell title="Write">
      <NotesList />
    </PageShell>
  )
}

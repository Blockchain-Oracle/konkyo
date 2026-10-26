import type { Metadata } from "next"
import { Suspense } from "react"
import { PageShell } from "@/components/page-shell"
import { PeopleView } from "@/components/people/people-view"

export const metadata: Metadata = { title: "People" }

/** Your people: friends, who you follow, who follows you; an invite card first. */
export default function PeoplePage() {
  return (
    <PageShell title="people" kicker="friends · following · followers">
      <Suspense fallback={<div className="h-64" aria-busy />}>
        <PeopleView />
      </Suspense>
    </PageShell>
  )
}

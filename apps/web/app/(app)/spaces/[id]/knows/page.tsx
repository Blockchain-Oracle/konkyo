import type { Metadata } from "next"
import { Suspense } from "react"
import { KnowsView } from "@/components/knows/knows-view"

export const metadata: Metadata = { title: "What this space knows" }

/** The id is URL data: it is read inside the boundary, so navigation stays instant. */
async function SpaceKnows({ params }: { params: PageProps<"/spaces/[id]/knows">["params"] }) {
  const { id } = await params
  return <KnowsView spaceId={id} />
}

/** What one space knows (plan F51): the other side of its wall. */
export default function SpaceKnowsPage({ params }: PageProps<"/spaces/[id]/knows">) {
  return (
    <Suspense>
      <SpaceKnows params={params} />
    </Suspense>
  )
}

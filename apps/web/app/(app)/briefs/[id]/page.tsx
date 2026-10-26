import type { Metadata } from "next"
import { Suspense } from "react"
import { BriefView } from "@/components/briefs/brief-view"

export const metadata: Metadata = { title: "Audio brief" }

async function Brief({ params }: { params: PageProps<"/briefs/[id]">["params"] }) {
  const { id } = await params
  return <BriefView id={id} />
}

/** One audio brief: its progress while it's made, then the player and transcript. */
export default function BriefPage({ params }: PageProps<"/briefs/[id]">) {
  return (
    <Suspense fallback={null}>
      <Brief params={params} />
    </Suspense>
  )
}

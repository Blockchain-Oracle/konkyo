import type { Metadata } from "next"
import { Suspense } from "react"
import { RoundRoom } from "@/components/study/live-round"

type Props = { params: Promise<{ code: string }> }

export const metadata: Metadata = { title: "Live round", robots: { index: false, follow: false } }

async function Room({ params }: Props) {
  const { code } = await params
  return <RoundRoom code={code.toUpperCase()} />
}

/** A live round: its lobby, its questions and its recap, for everyone in it. */
export default function LiveRoundPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="round-wall" aria-busy />}>
      <Room params={params} />
    </Suspense>
  )
}

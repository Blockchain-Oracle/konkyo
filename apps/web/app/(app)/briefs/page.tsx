import type { Metadata } from "next"
import { BriefsIndex } from "@/components/briefs/briefs-index"

export const metadata: Metadata = { title: "Audio briefs" }

/** Every audio brief (plan F37, gap #3): the ones being made, then the ones to play. */
export default function BriefsPage() {
  return <BriefsIndex />
}

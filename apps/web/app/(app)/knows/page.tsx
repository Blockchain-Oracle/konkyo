import type { Metadata } from "next"
import { KnowsView } from "@/components/knows/knows-view"

export const metadata: Metadata = { title: "What it knows" }

/** What Konkyo knows across your library (plan F51); it replaces Settings → Memory. */
export default function KnowsPage() {
  return <KnowsView spaceId={null} />
}

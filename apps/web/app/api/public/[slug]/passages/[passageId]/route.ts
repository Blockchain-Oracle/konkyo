import { publicRoute } from "@/lib/api"
import { publicPassage } from "@/lib/shares"

export const GET = publicRoute<{ slug: string; passageId: string }>(async ({ params }) =>
  publicPassage(params.slug, decodeURIComponent(params.passageId)),
)

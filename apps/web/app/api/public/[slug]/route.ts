import { publicRoute } from "@/lib/api"
import { openShare } from "@/lib/shares"

/** A public folder: its name, description and sources (plan F36). */
export const GET = publicRoute<{ slug: string }>(async ({ params }) => openShare(params.slug))

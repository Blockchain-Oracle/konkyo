import { route } from "@/lib/api"
import { saveSources } from "@/lib/articles"

/** "Save these sources to my library": a new space with the article's sources. */
export const POST = route<{ slug: string }>(async ({ userId, params }) =>
  saveSources(userId, params.slug),
)

import { route } from "@/lib/api"
import { like } from "@/lib/articles"

/** ♥ an article (kept accounts). */
export const POST = route<{ slug: string }>(async ({ userId, params }) =>
  like(userId, params.slug, true),
)

export const DELETE = route<{ slug: string }>(async ({ userId, params }) =>
  like(userId, params.slug, false),
)

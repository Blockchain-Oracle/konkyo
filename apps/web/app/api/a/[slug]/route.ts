import { route } from "@/lib/api"
import { unpublish } from "@/lib/articles"

/** The author unpublishes from the article itself (it works even once the note is gone). */
export const DELETE = route<{ slug: string }>(async ({ userId, params }) => {
  await unpublish(userId, { slug: params.slug })
})

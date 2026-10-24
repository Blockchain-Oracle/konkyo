import { z } from "zod"
import { route } from "@/lib/api"
import { report } from "@/lib/articles"

/** Report an article (signed in, so a report has someone behind it). */
export const POST = route<{ slug: string }, { reason: string }>(
  async ({ userId, params, body }) => report(userId, params.slug, body.reason),
  z.object({ reason: z.string().trim().min(3).max(500) }),
)

import { articleImage } from "@/lib/article-image"

/** An article's cover image (public, while it's published). */
export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  return articleImage((await ctx.params).slug, null)
}

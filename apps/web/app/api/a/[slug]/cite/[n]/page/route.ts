import { articleImage } from "@/lib/article-image"

/** A cited page as an image, only when it may be shown (an open licence, or the author's call). */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ slug: string; n: string }> },
) {
  const { slug, n } = await ctx.params
  const number = Number(n)
  if (!Number.isInteger(number) || number < 1) return new Response(null, { status: 404 })
  return articleImage(slug, number)
}

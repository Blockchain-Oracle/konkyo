import { notFound } from "next/navigation"
import { docsLlms, source } from "@/lib/source"

export const revalidate = false

/** One page as Markdown: /llms.mdx/docs/<slug>/content.md (Copy Markdown, Open in ChatGPT). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug?: string[] }> }) {
  const slugs = (await params).slug?.slice(0, -1) ?? []
  const page = source.getPage(slugs)
  if (!page) notFound()
  return new Response(await docsLlms.page(page), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  })
}

export function generateStaticParams() {
  return source.generateParams().map((item) => ({ ...item, slug: [...item.slug, "content.md"] }))
}

import { docsLlms } from "@/lib/source"

export const revalidate = false

/** Every page's title, link and description, for language models. */
export async function GET() {
  return new Response(await docsLlms.index(), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}

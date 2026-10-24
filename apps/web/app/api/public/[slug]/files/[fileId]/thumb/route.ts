import { streamObject } from "@konkyo/storage"
import { z } from "zod"
import { LibraryError } from "@/lib/library"
import { publicThumbKey } from "@/lib/shares"

/** A public space's source polaroid: only for a file the link shows. */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ slug: string; fileId: string }> },
) {
  const { slug, fileId } = await ctx.params
  const id = z.uuid().safeParse(fileId)
  if (!id.success) return new Response(null, { status: 404 })
  try {
    const key = await publicThumbKey(slug, id.data)
    if (!key) return new Response(null, { status: 404 })
    const object = await streamObject(key, null)
    return new Response(object.body, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    if (error instanceof LibraryError) return new Response(null, { status: error.status })
    if ((error as { name?: string }).name === "NoSuchKey")
      return new Response(null, { status: 404 })
    throw error
  }
}

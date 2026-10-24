import { streamObject } from "@konkyo/storage"
import { NextResponse } from "next/server"
import { LibraryError, readableFile } from "@/lib/library"
import { getSession } from "@/lib/session"

/**
 * A source's polaroid (page one, its og:image or video thumbnail), from our own origin: for its
 * owner and for the members of a space it's filed in.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  const { id } = await ctx.params
  try {
    const { file } = await readableFile(session.user.id, id)
    if (!file.thumbKey || file.deletedAt) return new Response(null, { status: 404 })
    const object = await streamObject(file.thumbKey, null)
    return new Response(object.body, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=86400",
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

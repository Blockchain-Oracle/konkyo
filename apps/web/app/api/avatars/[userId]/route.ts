import { streamObject } from "@konkyo/storage"
import { NextResponse } from "next/server"
import { photoKeyOf } from "@/lib/profiles"

/**
 * Someone's photo, for anyone who sees their face (a public page, a shared space). The address
 * carries the photo's version, so it is cached for good; only image types are ever stored, and it
 * is served so a browser can't read it as anything else.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ userId: string }> }) {
  const { userId } = await ctx.params
  const key = await photoKeyOf(userId)
  if (!key) return NextResponse.json({ error: "No photo" }, { status: 404 })
  try {
    const object = await streamObject(key)
    const type = object.contentType ?? ""
    if (!/^image\/(jpeg|png|webp)$/.test(type))
      return NextResponse.json({ error: "No photo" }, { status: 404 })
    return new Response(object.body, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    if ((error as { name?: string }).name === "NoSuchKey")
      return NextResponse.json({ error: "No photo" }, { status: 404 })
    console.error("[avatar]", error)
    return NextResponse.json({ error: "Couldn't load this photo" }, { status: 500 })
  }
}

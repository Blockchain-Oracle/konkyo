import { streamObject } from "@konkyo/storage"
import { NextResponse } from "next/server"
import { photoKeyOf } from "@/lib/profiles"

/**
 * Someone's photo, for anyone who sees their face (a public page, a shared space). The address
 * carries the photo's version and is cached for an hour; an old version or a photo that's no longer
 * their face is gone. Only JPEGs Konkyo re-encoded are stored.
 */
export async function GET(request: Request, ctx: { params: Promise<{ userId: string }> }) {
  const { userId } = await ctx.params
  const key = await photoKeyOf(userId, new URL(request.url).searchParams.get("v"))
  if (!key) return NextResponse.json({ error: "No photo" }, { status: 404 })
  try {
    const object = await streamObject(key)
    return new Response(object.body, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=3600",
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

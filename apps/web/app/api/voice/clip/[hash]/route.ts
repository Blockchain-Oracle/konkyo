import { streamObject } from "@konkyo/storage"
import { NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { clipKey } from "@/lib/voice-server"

/** A read-aloud clip by its hash (an unguessable digest of its text), with Range for seeking. */
export async function GET(request: Request, ctx: { params: Promise<{ hash: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  const { hash } = await ctx.params
  if (!/^[0-9a-f]{40}$/.test(hash))
    return NextResponse.json({ error: "No such clip" }, { status: 404 })
  try {
    const object = await streamObject(clipKey(hash), request.headers.get("range"))
    const headers = new Headers({
      "Content-Type": "audio/mpeg",
      "Accept-Ranges": "bytes",
      // the same text in the same voice is the same clip forever
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    })
    if (object.contentLength != null) headers.set("Content-Length", String(object.contentLength))
    if (object.contentRange) headers.set("Content-Range", object.contentRange)
    return new Response(object.body, { status: object.partial ? 206 : 200, headers })
  } catch (error) {
    if ((error as { name?: string }).name === "NoSuchKey")
      return NextResponse.json({ error: "No such clip" }, { status: 404 })
    if ((error as { name?: string }).name === "InvalidRange")
      return new Response(null, { status: 416 })
    console.error("[voice clip]", error)
    return NextResponse.json({ error: "Couldn't play this" }, { status: 500 })
  }
}

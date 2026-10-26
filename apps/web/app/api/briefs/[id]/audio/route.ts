import { streamObject } from "@konkyo/storage"
import { NextResponse } from "next/server"
import { z } from "zod"
import { briefAudio } from "@/lib/briefs"
import { LibraryError } from "@/lib/library"
import { getSession } from "@/lib/session"

/** A brief's mp3, with Range so the player can seek; `?download=1` saves it. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  try {
    const { key, name } = await briefAudio(session.user.id, z.uuid().parse((await ctx.params).id))
    const object = await streamObject(key, request.headers.get("range"))
    const headers = new Headers({
      "Content-Type": "audio/mpeg",
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    })
    if (object.contentLength != null) headers.set("Content-Length", String(object.contentLength))
    if (object.contentRange) headers.set("Content-Range", object.contentRange)
    if (object.etag) headers.set("ETag", object.etag)
    const download = new URL(request.url).searchParams.get("download")
    headers.set(
      "Content-Disposition",
      `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(name)}`,
    )
    return new Response(object.body, { status: object.partial ? 206 : 200, headers })
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: "No such brief" }, { status: 404 })
    if (error instanceof LibraryError)
      return NextResponse.json({ error: error.message }, { status: error.status })
    if ((error as { name?: string }).name === "InvalidRange")
      return new Response(null, { status: 416 })
    console.error("[brief audio]", error)
    return NextResponse.json({ error: "Couldn't play this brief" }, { status: 500 })
  }
}

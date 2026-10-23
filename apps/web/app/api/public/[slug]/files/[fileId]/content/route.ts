import { streamObject } from "@konkyo/storage"
import { NextResponse } from "next/server"
import { z } from "zod"
import { LibraryError } from "@/lib/library"
import { publicContentKey } from "@/lib/shares"

/**
 * A public folder's file bytes for the viewer (plan F36), with Range passthrough like the
 * owner's route. `&download=1` works only when the owner allowed downloads.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ slug: string; fileId: string }> },
) {
  const url = new URL(request.url)
  const as = url.searchParams.get("as") === "original" ? "original" : "rendition"
  const download = Boolean(url.searchParams.get("download"))
  try {
    const { slug, fileId } = await ctx.params
    const { key, name, mime } = await publicContentKey(slug, z.uuid().parse(fileId), as, download)
    const object = await streamObject(key, request.headers.get("range"))
    const headers = new Headers({
      "Content-Type": object.contentType || mime || "application/octet-stream",
      "Accept-Ranges": "bytes",
      // Not shared caches: unpublishing must stop the bytes too.
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    })
    if (object.contentLength != null) headers.set("Content-Length", String(object.contentLength))
    if (object.contentRange) headers.set("Content-Range", object.contentRange)
    if (object.etag) headers.set("ETag", object.etag)
    headers.set(
      "Content-Disposition",
      `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(name)}`,
    )
    return new Response(object.body, { status: object.partial ? 206 : 200, headers })
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: "No such file" }, { status: 404 })
    if (error instanceof LibraryError)
      return NextResponse.json({ error: error.message }, { status: error.status })
    if ((error as { name?: string }).name === "InvalidRange")
      return new Response(null, { status: 416 })
    console.error("[public content]", error)
    return NextResponse.json({ error: "Couldn't read this file" }, { status: 500 })
  }
}

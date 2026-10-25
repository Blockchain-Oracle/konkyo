import { streamObject } from "@konkyo/storage"
import { NextResponse } from "next/server"
import { fileContentKey, LibraryError } from "@/lib/library"
import { getSession } from "@/lib/session"

/**
 * A file's bytes from the app's own origin (plan F07, F05): `?as=rendition` (default) is the
 * readable PDF, `?as=original` the uploaded file; `&download=1` saves it under its own name.
 * Range requests pass through, so the PDF viewer loads big files page by page and players seek.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  const url = new URL(request.url)
  const as = url.searchParams.get("as") === "original" ? "original" : "rendition"
  try {
    const { key, name, mime } = await fileContentKey(session.user.id, (await ctx.params).id, as)
    const object = await streamObject(key, request.headers.get("range"))
    const headers = new Headers({
      // the type the file's own name gives (lib/library.ts), never the stored object's
      "Content-Type": mime || "application/octet-stream",
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    })
    if (object.contentLength != null) headers.set("Content-Length", String(object.contentLength))
    if (object.contentRange) headers.set("Content-Range", object.contentRange)
    if (object.etag) headers.set("ETag", object.etag)
    const disposition = url.searchParams.get("download") ? "attachment" : "inline"
    headers.set(
      "Content-Disposition",
      `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`,
    )
    return new Response(object.body, { status: object.partial ? 206 : 200, headers })
  } catch (error) {
    if (error instanceof LibraryError)
      return NextResponse.json({ error: error.message }, { status: error.status })
    if ((error as { name?: string }).name === "InvalidRange")
      return new Response(null, { status: 416 })
    console.error("[content]", error)
    return NextResponse.json({ error: "Couldn't read this file" }, { status: 500 })
  }
}

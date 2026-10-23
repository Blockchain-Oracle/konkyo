import { NextResponse } from "next/server"
import { z } from "zod"
import { noteDocx } from "@/lib/export-note"
import { LibraryError } from "@/lib/library"
import { getSession } from "@/lib/session"
import { getSettings } from "@/lib/settings"

const fileName = (title: string, ext: string) =>
  `${
    title
      .replace(/[^\p{L}\p{N} _-]+/gu, "")
      .trim()
      .slice(0, 80) || "Konkyo note"
  }.${ext}`

/** A note as Word (plan F26): GET ?style=<CSL id>, or the default style from Settings. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  const id = z.uuid().safeParse((await ctx.params).id)
  if (!id.success) return NextResponse.json({ error: "No such note" }, { status: 404 })
  const style =
    new URL(request.url).searchParams.get("style") ??
    (await getSettings(session.user.id)).citationStyle
  try {
    const { title, bytes } = await noteDocx(session.user.id, id.data, style)
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName(title, "docx"))}`,
      },
    })
  } catch (error) {
    if (error instanceof LibraryError)
      return NextResponse.json({ error: error.message }, { status: error.status })
    console.error("[export]", error)
    return NextResponse.json({ error: "That export didn't work. Try again." }, { status: 500 })
  }
}

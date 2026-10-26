import { markdownToPdf } from "@konkyo/ingest/convert"
import { NextResponse } from "next/server"
import { chatDocx } from "@/lib/chat-docx"
import { chatMarkdown } from "@/lib/chat-export"
import { LibraryError } from "@/lib/library"
import { getSession } from "@/lib/session"

/** A safe file name from the chat's title. */
const fileName = (title: string, ext: string) =>
  `${
    title
      .replace(/[^\p{L}\p{N} _-]+/gu, "")
      .trim()
      .slice(0, 80) || "Konkyo chat"
  }.${ext}`

/** Download a chat as Markdown, PDF or Word (plan F17): GET ?format=md|pdf|docx. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  const asked = new URL(request.url).searchParams.get("format")
  const format = asked === "pdf" || asked === "docx" ? asked : "md"
  try {
    const { title, markdown } = await chatMarkdown(session.user.id, (await ctx.params).id)
    const name = fileName(title, format)
    const disposition = `attachment; filename*=UTF-8''${encodeURIComponent(name)}`
    if (format === "md")
      return new Response(markdown, {
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "content-disposition": disposition,
        },
      })
    if (format === "docx")
      return new Response(new Uint8Array(await chatDocx(markdown, title)), {
        headers: {
          "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "content-disposition": disposition,
        },
      })
    const pdf = await markdownToPdf(markdown, title)
    return new Response(Buffer.from(pdf), {
      headers: { "content-type": "application/pdf", "content-disposition": disposition },
    })
  } catch (error) {
    if (error instanceof LibraryError)
      return NextResponse.json({ error: error.message }, { status: error.status })
    console.error("[export]", error)
    return NextResponse.json({ error: "That export didn't work. Try again." }, { status: 500 })
  }
}

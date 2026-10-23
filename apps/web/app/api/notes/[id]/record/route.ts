import { markdownToPdf } from "@konkyo/ingest/convert"
import { NextResponse } from "next/server"
import { z } from "zod"
import { LibraryError } from "@/lib/library"
import { processRecord, recordDocx, recordMarkdown } from "@/lib/process-record"
import { getSession } from "@/lib/session"

const TYPES = {
  md: "text/markdown; charset=utf-8",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const

/** The process record (plan F25) as Markdown, PDF or Word: GET ?format=md|pdf|docx. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  const id = z.uuid().safeParse((await ctx.params).id)
  if (!id.success) return NextResponse.json({ error: "No such note" }, { status: 404 })
  const asked = new URL(request.url).searchParams.get("format")
  const format = asked === "pdf" || asked === "docx" ? asked : "md"
  try {
    const record = await processRecord(session.user.id, id.data)
    const name = `Process record - ${
      record.note.title
        .replace(/[^\p{L}\p{N} _-]+/gu, "")
        .trim()
        .slice(0, 70) || "note"
    }.${format}`
    const body =
      format === "md"
        ? recordMarkdown(record)
        : format === "pdf"
          ? Buffer.from(
              await markdownToPdf(recordMarkdown(record), `Process record: ${record.note.title}`),
            )
          : new Uint8Array(await recordDocx(record))
    return new Response(body, {
      headers: {
        "content-type": TYPES[format],
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      },
    })
  } catch (error) {
    if (error instanceof LibraryError)
      return NextResponse.json({ error: error.message }, { status: error.status })
    console.error("[record]", error)
    return NextResponse.json({ error: "That export didn't work. Try again." }, { status: 500 })
  }
}

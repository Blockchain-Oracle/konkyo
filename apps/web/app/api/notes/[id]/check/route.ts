import { randomUUID } from "node:crypto"
import { type CheckEvent, checkDraft, Tracer } from "@konkyo/agents"
import { NextResponse } from "next/server"
import { z } from "zod"
import { docText } from "@/lib/export-note"
import { LibraryError } from "@/lib/library"
import { getNote, logNoteEvent, textHash } from "@/lib/notes"
import { getSession } from "@/lib/session"

export const maxDuration = 120

/** The most text one check reads. */
const CHECK_MAX = 60_000

/**
 * Check my draft (plan F23), streamed as one JSON event per line: the claims first, then each
 * claim's verdict as it's found, so the marks appear claim by claim.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  const id = z.uuid().safeParse((await ctx.params).id)
  // The editor sends its text; publishing asks for the saved note (`saved`), whose words the
  // server reads from the stored document itself, so the article's badge is about what publishes.
  const body = z
    .object({
      text: z.string().min(1).max(CHECK_MAX).optional(),
      saved: z.literal(true).optional(),
    })
    .refine((b) => Boolean(b.text) !== Boolean(b.saved))
    .safeParse(await request.json())
  if (!id.success || !body.success)
    return NextResponse.json({ error: "That request wasn't valid" }, { status: 400 })
  let text: string
  try {
    const note = await getNote(session.user.id, id.data)
    text = body.data.saved ? docText(note.content) : (body.data.text as string)
  } catch (error) {
    if (error instanceof LibraryError)
      return NextResponse.json({ error: error.message }, { status: error.status })
    throw error
  }
  if (!text.trim() || text.length > CHECK_MAX)
    return NextResponse.json(
      {
        error: text.trim() ? "This note is too long to check in one go." : "Nothing to check yet.",
      },
      { status: 400 },
    )
  const ownerId = session.user.id
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Leaving the page doesn't stop the check: it finishes and is kept in the process record.
      let open = true
      const send = (event: CheckEvent | { type: "error"; message: string }) => {
        if (!open) return
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        } catch {
          open = false
        }
      }
      try {
        const tracer = new Tracer(randomUUID())
        const { results, counts } = await checkDraft(ownerId, text, tracer, send)
        await logNoteEvent(ownerId, id.data, "checked", {
          runId: tracer.runId,
          // only a check of the saved note can stand behind a published article
          ...(body.data.saved ? { savedHash: textHash(text) } : {}),
          counts,
          claims: results.map((r) => ({
            claim: r.claim,
            verdict: r.verdict,
            source: r.passage
              ? `${r.passage.title}${r.passage.page ? `, p. ${r.passage.page}` : ""}`
              : null,
            quote: r.quote ?? null,
          })),
        })
      } catch (error) {
        console.error("[check]", error)
        send({ type: "error", message: "The check stopped on an error. Try again." })
      }
      if (open) controller.close()
    },
    cancel() {
      // The browser went away; the check goes on without it.
    },
  })
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-cache" },
  })
}

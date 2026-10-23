import { randomUUID } from "node:crypto"
import { type CheckEvent, checkDraft, Tracer } from "@konkyo/agents"
import { NextResponse } from "next/server"
import { z } from "zod"
import { LibraryError } from "@/lib/library"
import { getNote, logNoteEvent } from "@/lib/notes"
import { getSession } from "@/lib/session"

export const maxDuration = 120

/**
 * Check my draft (plan F23), streamed as one JSON event per line: the claims first, then each
 * claim's verdict as it's found, so the marks appear claim by claim.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  const id = z.uuid().safeParse((await ctx.params).id)
  const body = z.object({ text: z.string().min(1).max(60_000) }).safeParse(await request.json())
  if (!id.success || !body.success)
    return NextResponse.json({ error: "That request wasn't valid" }, { status: 400 })
  try {
    await getNote(session.user.id, id.data)
  } catch (error) {
    if (error instanceof LibraryError)
      return NextResponse.json({ error: error.message }, { status: error.status })
    throw error
  }
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
        const { results, counts } = await checkDraft(ownerId, body.data.text, tracer, send)
        await logNoteEvent(ownerId, id.data, "checked", {
          runId: tracer.runId,
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

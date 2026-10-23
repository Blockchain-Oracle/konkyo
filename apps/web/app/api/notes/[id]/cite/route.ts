import { randomUUID } from "node:crypto"
import { findCitations, Tracer } from "@konkyo/agents"
import { z } from "zod"
import { route } from "@/lib/api"
import { getNote, logNoteEvent } from "@/lib/notes"

/** Search citation (plan F22): passages that support the selected text, with checked quotes. */
export const POST = route<{ id: string }, { text: string }>(
  async ({ userId, params, body }) => {
    const id = z.uuid().parse(params.id)
    await getNote(userId, id)
    const tracer = new Tracer(randomUUID())
    const matches = await findCitations(userId, body.text, tracer)
    await logNoteEvent(userId, id, "searched-citation", {
      runId: tracer.runId,
      text: body.text.slice(0, 600),
      found: matches.length,
    })
    return { matches }
  },
  z.object({ text: z.string().trim().min(3).max(2000) }),
)

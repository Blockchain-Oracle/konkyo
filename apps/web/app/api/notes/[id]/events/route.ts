import { z } from "zod"
import { route } from "@/lib/api"
import { listNoteEvents, logNoteEvent } from "@/lib/notes"

export const GET = route<{ id: string }>(async ({ userId, params }) => ({
  events: await listNoteEvents(userId, z.uuid().parse(params.id)),
}))

/** The editor records what it did with the AI's help (an inserted citation, F25). */
export const POST = route<{ id: string }, { type: string; data: Record<string, unknown> }>(
  async ({ userId, params, body }) =>
    logNoteEvent(userId, z.uuid().parse(params.id), body.type, body.data),
  z.object({
    type: z.enum(["cited", "removed-citation", "suggestion-accepted"]),
    data: z.record(z.string(), z.unknown()),
  }),
)

import { z } from "zod"
import { route } from "@/lib/api"
import { createNote, listNotes, type NoteDoc } from "@/lib/notes"

export const GET = route(async ({ userId }) => ({ notes: await listNotes(userId) }))

type Body = { title?: string; folderId?: string; content?: NoteDoc; text?: string }

/** A new note (F21); "Start from a chat answer" sends its content along. */
export const POST = route<Record<string, never>, Body>(
  async ({ userId, body }) => createNote(userId, body),
  z.object({
    title: z.string().max(300).optional(),
    folderId: z.uuid().optional(),
    content: z
      .object({ type: z.literal("doc") })
      .passthrough()
      .optional() as z.ZodType<NoteDoc | undefined>,
    text: z.string().max(400_000).optional(),
  }),
)

import { z } from "zod"
import { route } from "@/lib/api"
import { getNote, type NoteDoc, saveNote } from "@/lib/notes"

export const GET = route<{ id: string }>(async ({ userId, params }) =>
  getNote(userId, z.uuid().parse(params.id)),
)

type Body = { title?: string; content?: NoteDoc; text?: string }

/** Autosave (F24): the title, the document and its plain text. */
export const PATCH = route<{ id: string }, Body>(
  async ({ userId, params, body }) => saveNote(userId, z.uuid().parse(params.id), body),
  z.object({
    title: z.string().max(300).optional(),
    content: z
      .object({ type: z.literal("doc") })
      .passthrough()
      .optional() as z.ZodType<NoteDoc | undefined>,
    text: z.string().max(400_000).optional(),
  }),
)

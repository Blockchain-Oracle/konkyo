import { z } from "zod"
import { route } from "@/lib/api"
import { appendToNote } from "@/lib/notes"

/** "Save to note" into an existing note. */
export const POST = route<{ id: string }, { content: unknown[]; text: string }>(
  async ({ userId, params, body }) => appendToNote(userId, z.uuid().parse(params.id), body),
  z.object({ content: z.array(z.unknown()).min(1).max(200), text: z.string().max(100_000) }),
)

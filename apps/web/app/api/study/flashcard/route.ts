import { z } from "zod"
import { route } from "@/lib/api"
import { makeFlashcard } from "@/lib/study"

type Body = { passageId?: string; fileId?: string; page?: number; text: string }

/** Make flashcard from a selection in the preview (F08): its passage, or the page it's on. */
export const POST = route<Record<string, never>, Body>(
  async ({ userId, body }) => makeFlashcard(userId, body),
  z.object({
    passageId: z.string().min(1).max(200).optional(),
    fileId: z.uuid().optional(),
    page: z.number().int().min(1).max(100_000).optional(),
    text: z.string().min(3).max(4000),
  }),
)

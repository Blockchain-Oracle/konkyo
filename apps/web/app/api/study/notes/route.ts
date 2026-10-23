import { z } from "zod"
import { route } from "@/lib/api"
import { notesFromFile } from "@/lib/study"

/** Lecture → notes (F32): a note whose every point cites the moment it comes from. */
export const POST = route<Record<string, never>, { fileId: string }>(
  async ({ userId, body }) => notesFromFile(userId, body.fileId),
  z.object({ fileId: z.uuid() }),
)

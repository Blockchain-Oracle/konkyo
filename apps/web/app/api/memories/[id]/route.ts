import { editMemory, forget } from "@konkyo/agents"
import { z } from "zod"
import { route } from "@/lib/api"
import { LibraryError } from "@/lib/library"

export const PATCH = route<{ id: string }, { content: string }>(
  async ({ userId, params, body }) => {
    if (!editMemory(userId, params.id, body.content.trim()))
      throw new LibraryError("That memory is already gone", 404)
  },
  z.object({ content: z.string().trim().min(3).max(500) }),
)

export const DELETE = route<{ id: string }>(async ({ userId, params }) => {
  if (!forget(userId, params.id)) throw new LibraryError("That memory is already gone", 404)
})

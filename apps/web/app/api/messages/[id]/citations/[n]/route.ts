import { z } from "zod"
import { route } from "@/lib/api"
import { rateCitation } from "@/lib/chats"
import { LibraryError } from "@/lib/library"

/** "Right passage?" on a cited passage: POST { right }. */
export const POST = route<{ id: string; n: string }, { right: boolean }>(
  async ({ userId, params, body }) => {
    const n = Number(params.n)
    if (!Number.isInteger(n) || n < 1) throw new LibraryError("No such citation", 404)
    return rateCitation(userId, params.id, n, body.right)
  },
  z.object({ right: z.boolean() }),
)

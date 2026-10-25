import { z } from "zod"
import { route } from "@/lib/api"
import { timeUp } from "@/lib/rounds"

/** A player's timer ran out: the question turns face up (once, whoever asks first). */
export const POST = route<{ id: string }, { version: number }>(
  async ({ userId, params, body }) => {
    await timeUp(userId, z.uuid().parse(params.id), body.version)
  },
  z.object({ version: z.number().int().min(0) }),
)

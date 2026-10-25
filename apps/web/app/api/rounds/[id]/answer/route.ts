import { z } from "zod"
import { route } from "@/lib/api"
import { answerQuestion } from "@/lib/rounds"

/** An answer to the question on screen, face down until everyone has answered. */
export const POST = route<{ id: string }, { at: number; choice: string }>(
  async ({ userId, params, body }) => {
    await answerQuestion(userId, z.uuid().parse(params.id), body)
  },
  z.object({ at: z.number().int().min(0), choice: z.string().min(1).max(40) }),
)

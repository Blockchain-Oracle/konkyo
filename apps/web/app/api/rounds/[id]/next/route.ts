import { z } from "zod"
import { route } from "@/lib/api"
import { nextQuestion } from "@/lib/rounds"

/** The host moves on: the next question, or the recap after the last. */
export const POST = route<{ id: string }, { version: number }>(
  async ({ userId, params, body }) => {
    await nextQuestion(userId, z.uuid().parse(params.id), body.version)
  },
  z.object({ version: z.number().int().min(0) }),
)

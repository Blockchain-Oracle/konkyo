import { z } from "zod"
import { route } from "@/lib/api"
import { reportWrong } from "@/lib/study"

/** This is wrong (F27): re-checked by the Verifier; removed and remembered if it agrees. */
export const POST = route<{ id: string }, { reason?: string }>(
  async ({ userId, params, body }) => reportWrong(userId, z.uuid().parse(params.id), body.reason),
  z.object({ reason: z.string().max(500).optional() }),
)

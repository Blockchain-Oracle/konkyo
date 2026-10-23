import { z } from "zod"
import { route } from "@/lib/api"
import { steerDeep } from "@/lib/deep"

/** Add a direction to a running deep search (plan F19). */
export const POST = route<{ runId: string }, { text: string }>(
  async ({ userId, params, body }) => steerDeep(userId, z.uuid().parse(params.runId), body.text),
  z.object({ text: z.string().trim().min(2).max(300) }),
)

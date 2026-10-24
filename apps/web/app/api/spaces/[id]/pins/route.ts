import { z } from "zod"
import { route } from "@/lib/api"
import { listPins, pinAnswer } from "@/lib/pins"

/** A space's pinned answers, newest first (plan F52). */
export const GET = route<{ id: string }>(async ({ userId, params }) => ({
  pins: await listPins(userId, params.id),
}))

/** Pin an answer (by its run) to this space's wall. */
export const POST = route<{ id: string }, { runId: string }>(
  async ({ userId, params, body }) => ({ pin: await pinAnswer(userId, params.id, body.runId) }),
  z.object({ runId: z.uuid() }),
)

import { z } from "zod"
import { route } from "@/lib/api"
import { startRound } from "@/lib/rounds"

/** The host starts the round: the first question, with its timer. */
export const POST = route<{ id: string }>(async ({ userId, params }) => {
  await startRound(userId, z.uuid().parse(params.id))
})

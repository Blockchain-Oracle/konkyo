import { z } from "zod"
import { route } from "@/lib/api"
import { endRound } from "@/lib/rounds"

/** The host ends the round early: everyone goes to the recap. */
export const POST = route<{ id: string }>(async ({ userId, params }) => {
  await endRound(userId, z.uuid().parse(params.id))
})

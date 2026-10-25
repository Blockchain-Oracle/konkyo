import { z } from "zod"
import { route } from "@/lib/api"
import { decideHeld } from "@/lib/inbound"

/** The owner's yes (add its sources) or no (discard) on mail that was held for them (F59). */
export const POST = route<{ id: string }, { add: boolean }>(
  async ({ userId, params, body }) => decideHeld(userId, z.uuid().parse(params.id), body.add),
  z.object({ add: z.boolean() }),
)

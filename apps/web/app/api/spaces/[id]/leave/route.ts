import { z } from "zod"
import { route } from "@/lib/api"
import { leaveSpace } from "@/lib/members"

/** Leave a space; `take` brings your own sources out with you. */
export const POST = route<{ id: string }, { take: boolean }>(
  async ({ userId, params, body }) => leaveSpace(userId, z.uuid().parse(params.id), body.take),
  z.object({ take: z.boolean().default(false) }),
)

import { z } from "zod"
import { route } from "@/lib/api"
import { inviteByEmail } from "@/lib/inbound"

/** An invite to the space by email (F59), from someone who may hand its link on. */
export const POST = route<{ id: string }, { email: string }>(
  async ({ userId, params, body }) => inviteByEmail(userId, z.uuid().parse(params.id), body.email),
  z.object({ email: z.email().max(254) }),
)

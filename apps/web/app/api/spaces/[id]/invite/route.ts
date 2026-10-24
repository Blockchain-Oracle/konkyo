import { z } from "zod"
import { route } from "@/lib/api"
import { inviteFor, resetInvite } from "@/lib/members"

const spaceId = (params: { id: string }) => z.uuid().parse(params.id)

/** The space's invite link (made for the owner if there's none; adders may copy it). */
export const GET = route<{ id: string }>(async ({ userId, params }) => ({
  invite: await inviteFor(userId, spaceId(params)),
}))

/** A new link with the role it gives; the old one stops working. Owner only. */
export const POST = route<{ id: string }, { role: "add" | "read" }>(
  async ({ userId, params, body }) => ({
    invite: await resetInvite(userId, spaceId(params), body.role),
  }),
  z.object({ role: z.enum(["add", "read"]) }),
)

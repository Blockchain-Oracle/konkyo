import { z } from "zod"
import { publicRoute, route } from "@/lib/api"
import { invitePreview, joinSpace } from "@/lib/members"

const token = (params: { token: string }) =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]{16,40}$/)
    .parse(params.token)

/** What an invite opens onto, for anyone holding the link (the join page). */
export const GET = publicRoute<{ token: string }>(async ({ params }) =>
  invitePreview(token(params)),
)

/** Join the space the link is for. */
export const POST = route<{ token: string }>(async ({ userId, params }) =>
  joinSpace(userId, token(params)),
)

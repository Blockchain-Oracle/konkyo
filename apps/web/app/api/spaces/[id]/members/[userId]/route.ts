import { z } from "zod"
import { route } from "@/lib/api"
import { removeMember, setMemberRole } from "@/lib/members"

type Params = { id: string; userId: string }
const ids = (params: Params) => ({ space: z.uuid().parse(params.id), member: params.userId })

/** Change what a member may do (add sources, or read and ask). Owner only. */
export const PATCH = route<Params, { role: "add" | "read" }>(
  async ({ userId, params, body }) => {
    const { space, member } = ids(params)
    await setMemberRole(userId, space, member, body.role)
  },
  z.object({ role: z.enum(["add", "read"]) }),
)

/** Take someone out; their sources leave with them. Owner only. */
export const DELETE = route<Params>(async ({ userId, params }) => {
  const { space, member } = ids(params)
  await removeMember(userId, space, member)
})

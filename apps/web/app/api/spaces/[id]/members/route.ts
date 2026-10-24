import { z } from "zod"
import { route } from "@/lib/api"
import { listMembers } from "@/lib/members"

/** Everyone in the space, owner first, with roles: for anyone in it. */
export const GET = route<{ id: string }>(async ({ userId, params }) => ({
  members: await listMembers(userId, z.uuid().parse(params.id)),
}))

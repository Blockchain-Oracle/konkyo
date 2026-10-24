import { z } from "zod"
import { route } from "@/lib/api"
import { revokeKey } from "@/lib/api-keys"

/** Revoke: the key stops working at once. */
export const DELETE = route<{ id: string }>(async ({ userId, params }) => {
  await revokeKey(userId, z.uuid().parse(params.id))
})

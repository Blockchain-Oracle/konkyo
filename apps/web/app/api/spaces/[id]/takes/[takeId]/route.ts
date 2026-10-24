import { z } from "zod"
import { route } from "@/lib/api"
import { removeTake } from "@/lib/takes"

/** Take a take back (its author), or remove it (the space's owner). */
export const DELETE = route<{ id: string; takeId: string }>(async ({ userId, params }) =>
  removeTake(userId, z.uuid().parse(params.id), z.uuid().parse(params.takeId)),
)

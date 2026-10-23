import { z } from "zod"
import { route } from "@/lib/api"
import { deleteSet, getSet } from "@/lib/study"

/** A set's progress while it's made (passages read, items checked) and after. */
export const GET = route<{ id: string }>(async ({ userId, params }) =>
  getSet(userId, z.uuid().parse(params.id)),
)

export const DELETE = route<{ id: string }>(async ({ userId, params }) =>
  deleteSet(userId, z.uuid().parse(params.id)),
)

import { z } from "zod"
import { route } from "@/lib/api"
import { deleteBatches, restoreBatch } from "@/lib/trash"

/** Restore what was deleted together. */
export const POST = route<{ batch: string }>(async ({ userId, params }) =>
  restoreBatch(userId, z.uuid().parse(params.batch)),
)

/** Delete it for good, before its 30 days are up. */
export const DELETE = route<{ batch: string }>(async ({ userId, params }) =>
  deleteBatches(userId, [z.uuid().parse(params.batch)]),
)

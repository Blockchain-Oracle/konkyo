import { z } from "zod"
import { route } from "@/lib/api"
import { editItem, type ItemEdit, setItemStatus } from "@/lib/study"

/** Edit (F27): checked against the source before it's saved, unless kept unchecked. */
export const PATCH = route<{ id: string }, ItemEdit>(
  async ({ userId, params, body }) => editItem(userId, z.uuid().parse(params.id), body),
  z.object({
    prompt: z.string().min(1).max(1000),
    answer: z.string().max(500),
    accepted: z.array(z.string().max(200)).max(6).optional(),
    hints: z.array(z.string().max(400)).max(2).optional(),
    steps: z.array(z.string().max(300)).min(3).max(6).optional(),
    keepUnchecked: z.boolean().optional(),
  }),
)

/** Remove (F27); Undo restores it. */
export const DELETE = route<{ id: string }>(async ({ userId, params }) =>
  setItemStatus(userId, z.uuid().parse(params.id), "removed"),
)

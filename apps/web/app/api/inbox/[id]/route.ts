import { z } from "zod"
import { route } from "@/lib/api"
import { updateItem } from "@/lib/inbox"

/** Read / unread, Dismiss (and Undo). */
export const PATCH = route<{ id: string }, { read?: boolean; dismissed?: boolean }>(
  async ({ userId, params, body }) => updateItem(userId, z.uuid().parse(params.id), body),
  z.object({ read: z.boolean().optional(), dismissed: z.boolean().optional() }),
)

import { z } from "zod"
import { route } from "@/lib/api"
import { importItems } from "@/lib/connections"

const Item = z.object({
  id: z.string().min(1).max(300),
  title: z.string().min(1).max(500),
  version: z.string().max(100).nullable(),
  mimeType: z.string().max(200).optional(),
})

/** Import picked items: each becomes a file the worker fetches and reads like an upload. */
export const POST = route<{ id: string }, { items: z.infer<typeof Item>[]; folderId?: string }>(
  async ({ userId, params, body }) => importItems(userId, z.uuid().parse(params.id), body),
  z.object({ items: z.array(Item).min(1).max(50), folderId: z.uuid().optional() }),
)

import { z } from "zod"
import { route } from "@/lib/api"
import { importUrl } from "@/lib/library"

export const POST = route(
  async ({ userId, body }) => importUrl(userId, body.url, body.folderId),
  z.object({ url: z.string().min(4).max(2000), folderId: z.uuid().optional() }),
)

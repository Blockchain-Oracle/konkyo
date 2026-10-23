import { z } from "zod"
import { route } from "@/lib/api"
import { moveFiles } from "@/lib/folders"

export const POST = route(
  async ({ userId, body }) => moveFiles(userId, body.fileIds, body.folderId),
  z.object({ fileIds: z.array(z.uuid()).min(1).max(1000), folderId: z.uuid().nullable() }),
)

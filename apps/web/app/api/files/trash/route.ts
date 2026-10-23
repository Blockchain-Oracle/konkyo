import { z } from "zod"
import { route } from "@/lib/api"
import { trashFiles } from "@/lib/trash"

/** Several files to Trash at once (bulk actions); they come back together on Restore. */
export const POST = route(
  async ({ userId, body }) => trashFiles(userId, body.fileIds),
  z.object({ fileIds: z.array(z.uuid()).min(1).max(1000) }),
)

import { z } from "zod"
import { route } from "@/lib/api"
import { createFolder, FOLDER_NAME_MAX, listFolders } from "@/lib/folders"

export const GET = route(async ({ userId }) => ({ folders: await listFolders(userId) }))

export const POST = route(
  async ({ userId, body }) => createFolder(userId, body.name, body.parentId),
  z.object({ name: z.string().min(1).max(FOLDER_NAME_MAX), parentId: z.uuid().nullish() }),
)

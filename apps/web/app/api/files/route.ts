import { STORAGE } from "@konkyo/config"
import { z } from "zod"
import { route } from "@/lib/api"
import { listFiles, registerUpload } from "@/lib/library"

/** `?folder=<id>` lists one folder's files; `?space=<id>` everything filed anywhere in a space. */
export const GET = route(async ({ userId, request }) => {
  const params = new URL(request.url).searchParams
  const folder = params.get("folder")
  const space = params.get("space")
  return {
    files: await listFiles(
      userId,
      folder ? z.uuid().parse(folder) : undefined,
      space ? z.uuid().parse(space) : undefined,
    ),
  }
})

export const POST = route(
  async ({ userId, body }) => registerUpload(userId, body),
  z.object({
    name: z.string().min(1).max(300),
    size: z.number().int().positive().max(STORAGE.maxUploadBytes),
    type: z.string().max(200).optional(),
    relativePath: z.string().max(1000).optional(),
    folderId: z.uuid().optional(),
  }),
)

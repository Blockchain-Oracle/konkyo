import { STORAGE } from "@konkyo/config"
import { z } from "zod"
import { route } from "@/lib/api"
import { listFiles, registerUpload } from "@/lib/library"

/** `?folder=<id>` lists one folder's files. */
export const GET = route(async ({ userId, request }) => {
  const folder = new URL(request.url).searchParams.get("folder")
  return { files: await listFiles(userId, folder ? z.uuid().parse(folder) : undefined) }
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

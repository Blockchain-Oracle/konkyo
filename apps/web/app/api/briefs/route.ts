import { z } from "zod"
import { route } from "@/lib/api"
import { listBriefs, startBrief } from "@/lib/briefs"

/** `?folder=<id>` lists one folder's briefs. */
export const GET = route(async ({ userId, request }) => {
  const folder = new URL(request.url).searchParams.get("folder")
  return { briefs: await listBriefs(userId, folder ? z.uuid().parse(folder) : undefined) }
})

/** Make an audio brief of a folder or some files. */
export const POST = route<Record<string, never>, { folderId?: string; fileIds?: string[] }>(
  async ({ userId, body }) => startBrief(userId, body),
  z.object({ folderId: z.uuid().optional(), fileIds: z.array(z.uuid()).max(50).optional() }),
)

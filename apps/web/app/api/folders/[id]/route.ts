import { z } from "zod"
import { route } from "@/lib/api"
import { FOLDER_NAME_MAX, folderPath, moveFolder, renameFolder, trashFolder } from "@/lib/folders"

/** The folder's place: its breadcrumb from the top level. */
export const GET = route<{ id: string }>(async ({ userId, params }) => ({
  path: await folderPath(userId, params.id),
}))

/** Rename, or move under another folder (`parentId: null` is the top level). */
export const PATCH = route<{ id: string }, { name?: string; parentId?: string | null }>(
  async ({ userId, params, body }) => {
    if (body.name != null) await renameFolder(userId, params.id, body.name)
    if (body.parentId !== undefined) await moveFolder(userId, params.id, body.parentId)
  },
  z.object({
    name: z.string().min(1).max(FOLDER_NAME_MAX).optional(),
    parentId: z.uuid().nullish(),
  }),
)

export const DELETE = route<{ id: string }>(async ({ userId, params }) =>
  trashFolder(userId, params.id),
)

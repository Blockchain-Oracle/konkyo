import { z } from "zod"
import { route } from "@/lib/api"
import { getShare, publishFolder, unpublishFolder } from "@/lib/shares"

const folderId = (params: { id: string }) => z.uuid().parse(params.id)

/** The folder's public link (plan F36), if it has one. */
export const GET = route<{ id: string }>(async ({ userId, params }) => ({
  share: await getShare(userId, folderId(params)),
}))

/** Publish, or change the description, downloads, and whether it shows on your page. */
export const PUT = route<
  { id: string },
  { description?: string | null; allowDownloads?: boolean; listed?: boolean }
>(
  async ({ userId, params, body }) => ({
    share: await publishFolder(userId, folderId(params), body),
  }),
  z.object({
    description: z.string().max(500).nullable().optional(),
    allowDownloads: z.boolean().optional(),
    listed: z.boolean().optional(),
  }),
)

/** Unpublish: the link stops working. */
export const DELETE = route<{ id: string }>(async ({ userId, params }) => {
  await unpublishFolder(userId, folderId(params))
  return { share: null }
})

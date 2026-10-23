import { route } from "@/lib/api"
import { emptyTrash, listTrash } from "@/lib/trash"

export const GET = route(async ({ userId }) => ({ items: await listTrash(userId) }))

/** Empty Trash: everything in it is deleted for good. */
export const DELETE = route(async ({ userId }) => emptyTrash(userId))

import { route } from "@/lib/api"
import { getFileDetail } from "@/lib/library"
import { trashFiles } from "@/lib/trash"

export const GET = route<{ id: string }>(async ({ userId, params }) =>
  getFileDetail(userId, params.id),
)

export const DELETE = route<{ id: string }>(async ({ userId, params }) =>
  trashFiles(userId, [params.id]),
)

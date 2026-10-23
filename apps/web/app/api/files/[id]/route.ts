import { route } from "@/lib/api"
import { getFileDetail, trashFile } from "@/lib/library"

export const GET = route<{ id: string }>(async ({ userId, params }) =>
  getFileDetail(userId, params.id),
)

export const DELETE = route<{ id: string }>(async ({ userId, params }) =>
  trashFile(userId, params.id),
)

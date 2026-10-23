import { route } from "@/lib/api"
import { trashFile } from "@/lib/library"

export const DELETE = route<{ id: string }>(async ({ userId, params }) =>
  trashFile(userId, params.id),
)

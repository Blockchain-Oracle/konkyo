import { route } from "@/lib/api"
import { unpin } from "@/lib/pins"

export const DELETE = route<{ id: string; pinId: string }>(async ({ userId, params }) =>
  unpin(userId, params.id, params.pinId),
)

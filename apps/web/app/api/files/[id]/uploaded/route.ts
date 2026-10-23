import { route } from "@/lib/api"
import { markUploaded } from "@/lib/library"

export const POST = route<{ id: string }>(async ({ userId, params }) =>
  markUploaded(userId, params.id),
)

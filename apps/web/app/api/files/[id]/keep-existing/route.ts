import { route } from "@/lib/api"
import { keepExisting } from "@/lib/library"

export const POST = route<{ id: string }>(async ({ userId, params }) =>
  keepExisting(userId, params.id),
)

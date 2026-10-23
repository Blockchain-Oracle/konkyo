import { route } from "@/lib/api"
import { retryFile } from "@/lib/library"

export const POST = route<{ id: string }>(async ({ userId, params }) =>
  retryFile(userId, params.id),
)

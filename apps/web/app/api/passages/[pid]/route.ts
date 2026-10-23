import { route } from "@/lib/api"
import { getPassage } from "@/lib/library"

export const GET = route<{ pid: string }>(async ({ userId, params }) =>
  getPassage(userId, decodeURIComponent(params.pid)),
)

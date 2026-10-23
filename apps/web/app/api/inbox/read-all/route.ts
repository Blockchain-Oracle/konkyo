import { route } from "@/lib/api"
import { markAllRead } from "@/lib/inbox"

export const POST = route(async ({ userId }) => markAllRead(userId))

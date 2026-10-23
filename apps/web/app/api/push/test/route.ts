import { route } from "@/lib/api"
import { testPush } from "@/lib/inbox"

export const POST = route(async ({ userId }) => testPush(userId))

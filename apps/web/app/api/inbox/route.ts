import { route } from "@/lib/api"
import { listInbox } from "@/lib/inbox"

export const GET = route(async ({ userId }) => ({ items: await listInbox(userId) }))

import { route } from "@/lib/api"
import { listChats } from "@/lib/chats"

export const GET = route(async ({ userId }) => ({ chats: await listChats(userId) }))

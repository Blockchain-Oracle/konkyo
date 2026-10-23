import { forgetAll, listMemories } from "@konkyo/agents"
import { route } from "@/lib/api"

export const GET = route(async ({ userId }) => ({ memories: listMemories(userId) }))

export const DELETE = route(async ({ userId }) => forgetAll(userId))

import { forgetAll, listMemories, tellMemory } from "@konkyo/agents"
import { z } from "zod"
import { route } from "@/lib/api"

export const GET = route(async ({ userId }) => ({ memories: listMemories(userId) }))

export const DELETE = route(async ({ userId }) => forgetAll(userId))

/** "Tell it something" (plan F51): a line the person writes, read before answers like any other. */
export const POST = route<Record<string, never>, { content: string }>(
  async ({ userId, body }) => {
    const told = tellMemory(userId, body.content)
    return { id: told.id }
  },
  z.object({ content: z.string().trim().min(3).max(240) }),
)

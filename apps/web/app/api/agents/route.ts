import { z } from "zod"
import { type AgentInput, createAgent, listAgents } from "@/lib/agents"
import { route } from "@/lib/api"

const Schedule = z.object({
  every: z.enum(["day", "week"]),
  weekday: z.number().int().min(0).max(6).optional(),
  hour: z.number().int().min(0).max(23),
})
const Scope = z.object({
  fileIds: z.array(z.uuid()).max(50),
  folderIds: z.array(z.uuid()).max(20),
})

export const GET = route(async ({ userId }) => ({ agents: await listAgents(userId) }))

/** Create → Agent (F34): a watch, a scheduled quiz or a weekly brief; it runs once straight away. */
export const POST = route<Record<string, never>, AgentInput>(
  async ({ userId, body }) => createAgent(userId, body),
  z.object({
    name: z.string().min(1).max(120),
    kind: z.enum(["watch", "quiz", "brief"]),
    instructions: z.string().max(300),
    scope: Scope,
    schedule: Schedule,
    timeZone: z.string().max(64).optional(),
  }),
)

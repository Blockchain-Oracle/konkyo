import { z } from "zod"
import { type AgentInput, deleteAgent, updateAgent } from "@/lib/agents"
import { route } from "@/lib/api"

const Patch = z.object({
  name: z.string().min(1).max(120).optional(),
  instructions: z.string().max(300).optional(),
  scope: z
    .object({ fileIds: z.array(z.uuid()).max(50), folderIds: z.array(z.uuid()).max(20) })
    .optional(),
  schedule: z
    .object({
      every: z.enum(["day", "week"]),
      weekday: z.number().int().min(0).max(6).optional(),
      hour: z.number().int().min(0).max(23),
    })
    .optional(),
  status: z.enum(["active", "paused"]).optional(),
})

/** Edit, pause or resume. */
export const PATCH = route<{ id: string }, Partial<AgentInput> & { status?: "active" | "paused" }>(
  async ({ userId, params, body }) => updateAgent(userId, z.uuid().parse(params.id), body),
  Patch,
)

export const DELETE = route<{ id: string }>(async ({ userId, params }) =>
  deleteAgent(userId, z.uuid().parse(params.id)),
)

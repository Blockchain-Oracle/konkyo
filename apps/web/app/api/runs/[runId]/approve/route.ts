import { z } from "zod"
import { route } from "@/lib/api"
import { approveDeep } from "@/lib/deep"

type Body = { keys: string[]; folderName: string; always?: boolean }

/** Import the chosen sources. */
export const POST = route<{ runId: string }, Body>(
  async ({ userId, params, body }) => approveDeep(userId, z.uuid().parse(params.runId), body),
  z.object({
    keys: z.array(z.string().min(1).max(400)).min(1).max(20),
    folderName: z.string().trim().min(1).max(80),
    always: z.boolean().optional(),
  }),
)

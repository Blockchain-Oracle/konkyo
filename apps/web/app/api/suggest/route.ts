import { suggestQuestions } from "@konkyo/agents"
import { z } from "zod"
import { route } from "@/lib/api"

type Body = { fileIds?: string[]; folderIds?: string[] }

/** Suggested questions for a focus (plan F16): POST, since a focus can list many files. */
export const POST = route<Record<string, never>, Body>(
  async ({ userId, body }) => ({ questions: await suggestQuestions(userId, body) }),
  z.object({
    fileIds: z.array(z.uuid()).max(200).optional(),
    folderIds: z.array(z.uuid()).max(50).optional(),
  }),
)

import type { StudyScope } from "@konkyo/db/schema"
import { z } from "zod"
import { route } from "@/lib/api"
import { createSet, listSets } from "@/lib/study"

export const GET = route(async ({ userId }) => ({ sets: await listSets(userId) }))

/** Quiz me (plan F27): a practice set from files or folders, made in the background. */
export const POST = route<Record<string, never>, { scope: StudyScope; title?: string }>(
  async ({ userId, body }) => createSet(userId, body),
  z.object({
    scope: z.object({
      fileIds: z.array(z.uuid()).max(50),
      folderIds: z.array(z.uuid()).max(20),
    }),
    title: z.string().max(200).optional(),
  }),
)

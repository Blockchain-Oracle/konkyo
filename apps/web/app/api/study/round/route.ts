import type { StudyMode } from "@konkyo/db/schema"
import { z } from "zod"
import { route } from "@/lib/api"
import { buildRound } from "@/lib/study"

const Query = z.object({
  mode: z.enum(["quiz", "review", "recall", "fix", "evidence", "order", "compare"]),
  set: z.uuid().optional(),
  ids: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(",").filter(Boolean) : undefined))
    .pipe(z.array(z.uuid()).max(40).optional()),
})

/** A round to play: a quiz, today's review, or one of the five games (F28–F30). */
export const GET = route(async ({ userId, request }) => {
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const { mode, set, ids } = Query.parse(params)
  return buildRound(userId, { mode: mode as StudyMode, setId: set, ids })
})

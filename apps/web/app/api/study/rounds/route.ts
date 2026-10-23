import type { StudyMode } from "@konkyo/db/schema"
import { z } from "zod"
import { route } from "@/lib/api"
import { finishRound } from "@/lib/study"

type Body = {
  roundId: string
  mode: StudyMode
  setId?: string
  items: number
  right: number
  helped: number
  shown: number
  timeZone?: string
}

/** A finished round: its score, and what it did for the streak (F31). */
export const POST = route<Record<string, never>, Body>(
  async ({ userId, body }) => finishRound(userId, body),
  z.object({
    roundId: z.uuid(),
    mode: z.enum(["quiz", "review", "recall", "fix", "evidence", "order", "compare"]),
    setId: z.uuid().optional(),
    items: z.number().int().min(0).max(100),
    right: z.number().int().min(0).max(100),
    helped: z.number().int().min(0).max(100),
    shown: z.number().int().min(0).max(100),
    timeZone: z.string().max(64).optional(),
  }),
)

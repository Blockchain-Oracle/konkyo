import type { GradeValue, Outcome } from "@konkyo/study"
import { z } from "zod"
import { route } from "@/lib/api"
import { recordReview } from "@/lib/study"

type Body = {
  roundId: string
  outcome: Outcome
  grade: GradeValue
  hints: number
  tries: number
  answer?: string
  ms?: number
}

/** One answer into FSRS and the review log (F29). */
export const POST = route<{ id: string }, Body>(
  async ({ userId, params, body }) => recordReview(userId, z.uuid().parse(params.id), body),
  z.object({
    roundId: z.uuid(),
    outcome: z.enum(["right", "helped", "shown"]),
    grade: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    hints: z.number().int().min(0).max(5),
    tries: z.number().int().min(0).max(50),
    answer: z.string().max(2000).optional(),
    ms: z.number().int().min(0).max(3_600_000).optional(),
  }) as z.ZodType<Body>,
)

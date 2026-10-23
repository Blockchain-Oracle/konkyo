import { z } from "zod"
import { route } from "@/lib/api"
import { gradeItem } from "@/lib/study"

/** A typed answer the browser's own check couldn't settle (F28). */
export const POST = route<{ id: string }, { given: string; rewrite?: boolean }>(
  async ({ userId, params, body }) => gradeItem(userId, z.uuid().parse(params.id), body),
  z.object({ given: z.string().max(2000), rewrite: z.boolean().optional() }),
)

import { z } from "zod"
import { route } from "@/lib/api"
import { addHighlights, listHighlights } from "@/lib/highlights"

export const GET = route<{ id: string }>(async ({ userId, params }) => ({
  highlights: await listHighlights(userId, params.id),
}))

const box = z.tuple([z.number(), z.number(), z.number(), z.number()])

/** One highlight per page the selection covers. */
export const POST = route<
  { id: string },
  { marks: { page: number; rects: [number, number, number, number][]; text: string }[] }
>(
  async ({ userId, params, body }) => addHighlights(userId, params.id, body.marks),
  z.object({
    marks: z
      .array(
        z.object({
          page: z.number().int().positive(),
          rects: z.array(box).min(1).max(500),
          text: z.string().min(1).max(20_000),
        }),
      )
      .min(1)
      .max(50),
  }),
)

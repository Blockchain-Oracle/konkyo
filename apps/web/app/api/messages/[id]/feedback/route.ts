import { z } from "zod"
import { route } from "@/lib/api"
import { type Rating, rateMessage } from "@/lib/chats"

export const POST = route<{ id: string }, Rating>(
  async ({ userId, params, body }) => rateMessage(userId, params.id, body),
  z.object({
    rating: z.enum(["up", "down"]).nullable(),
    reason: z.string().min(1).max(60).optional(),
    note: z.string().max(500).optional(),
  }),
)

import { z } from "zod"
import { route } from "@/lib/api"
import { createRound, roundSources } from "@/lib/rounds"

/** Start a live round (plan F58) from a practice set, a space, or the whole library. */
export const POST = route<Record<string, never>, { setId?: string; spaceId?: string }>(
  async ({ userId, body }) => createRound(userId, body),
  z.object({ setId: z.uuid().optional(), spaceId: z.uuid().optional() }),
)

/** The practice sets a round can be started from. */
export const GET = route(async ({ userId }) => ({ sets: await roundSources(userId) }))

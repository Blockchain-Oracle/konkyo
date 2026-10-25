import { z } from "zod"
import { route } from "@/lib/api"
import { roundView } from "@/lib/rounds"

/** What a player sees now (players only). */
export const GET = route<{ id: string }>(async ({ userId, params }) =>
  roundView(userId, z.uuid().parse(params.id)),
)

import { z } from "zod"
import { route } from "@/lib/api"
import { activeRoundIn } from "@/lib/rounds"

/** The live round going on in this space now, or the one `?round=` names (members only). */
export const GET = route<{ id: string }>(async ({ userId, params, request }) => {
  const round = z.uuid().safeParse(new URL(request.url).searchParams.get("round")).data
  return { round: await activeRoundIn(userId, z.uuid().parse(params.id), round) }
})

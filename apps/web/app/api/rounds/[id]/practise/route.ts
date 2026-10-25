import { z } from "zod"
import { route } from "@/lib/api"
import { practiseMissed } from "@/lib/rounds"

/** "Review the ones we missed": where to practise them. */
export const POST = route<{ id: string }>(async ({ userId, params }) =>
  practiseMissed(userId, z.uuid().parse(params.id)),
)

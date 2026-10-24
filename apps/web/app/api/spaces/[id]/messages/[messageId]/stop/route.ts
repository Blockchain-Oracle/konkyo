import { z } from "zod"
import { route } from "@/lib/api"
import { stopAnswer } from "@/lib/space-chat"

/** Stop Konkyo's answer (whoever asked, or the space's owner). */
export const POST = route<{ id: string; messageId: string }>(async ({ userId, params }) =>
  stopAnswer(userId, z.uuid().parse(params.id), z.string().max(64).parse(params.messageId)),
)

import { z } from "zod"
import { route } from "@/lib/api"
import { pinFromThread } from "@/lib/space-chat"

/** Pin Konkyo's answer from the thread to the wall. */
export const POST = route<{ id: string; messageId: string }>(async ({ userId, params }) =>
  pinFromThread(userId, z.uuid().parse(params.id), z.string().max(64).parse(params.messageId)),
)

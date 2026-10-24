import { z } from "zod"
import { route } from "@/lib/api"
import { removeMessage } from "@/lib/space-chat"

/** Take a message back (its author) or remove it (the space's owner). */
export const DELETE = route<{ id: string; messageId: string }>(async ({ userId, params }) =>
  removeMessage(userId, z.uuid().parse(params.id), z.string().max(64).parse(params.messageId)),
)

import { z } from "zod"
import { route } from "@/lib/api"
import { listMessages, MESSAGE_MAX, postMessage } from "@/lib/space-chat"

const spaceId = (params: { id: string }) => z.uuid().parse(params.id)

/** The space chat's newest messages, oldest first. */
export const GET = route<{ id: string }>(async ({ userId, params }) => ({
  messages: await listMessages(userId, spaceId(params)),
}))

/** Say something; "@konkyo …" asks the space and Konkyo answers in the thread. */
export const POST = route<{ id: string }, { id: string; body: string; replyToId?: string }>(
  async ({ userId, params, body }) => postMessage(userId, spaceId(params), body),
  z.object({
    id: z.uuid(),
    body: z.string().trim().min(1).max(MESSAGE_MAX),
    replyToId: z.string().max(64).optional(),
  }),
)

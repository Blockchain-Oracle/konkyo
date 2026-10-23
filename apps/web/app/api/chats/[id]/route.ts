import { z } from "zod"
import { route } from "@/lib/api"
import { editChat, trashChat } from "@/lib/chats"

export const PATCH = route<{ id: string }, { title?: string; pinned?: boolean }>(
  async ({ userId, params, body }) => editChat(userId, params.id, body),
  z.object({ title: z.string().min(1).max(200).optional(), pinned: z.boolean().optional() }),
)

export const DELETE = route<{ id: string }>(async ({ userId, params }) =>
  trashChat(userId, params.id),
)

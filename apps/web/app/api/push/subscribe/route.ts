import { z } from "zod"
import { route } from "@/lib/api"
import { subscribe, unsubscribe } from "@/lib/inbox"

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } }

export const POST = route<Record<string, never>, Sub>(
  async ({ userId, body, request }) => subscribe(userId, body, request.headers.get("user-agent")),
  z.object({
    endpoint: z.url().max(2000),
    keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
  }),
)

export const DELETE = route<Record<string, never>, { endpoint: string }>(
  async ({ userId, body }) => unsubscribe(userId, body.endpoint),
  z.object({ endpoint: z.url().max(2000) }),
)

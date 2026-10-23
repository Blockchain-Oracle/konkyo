import { z } from "zod"
import { runNow } from "@/lib/agents"
import { route } from "@/lib/api"

/** Run now (F34): queued straight away; the result lands in the run history and the Inbox. */
export const POST = route<{ id: string }>(async ({ userId, params }) =>
  runNow(userId, z.uuid().parse(params.id)),
)

import { z } from "zod"
import { route } from "@/lib/api"
import { deepMessage } from "@/lib/deep"

/** A deep run's saved message, once it has answered. */
export const GET = route<{ runId: string }>(async ({ userId, params }) => ({
  message: await deepMessage(userId, z.uuid().parse(params.runId)),
}))

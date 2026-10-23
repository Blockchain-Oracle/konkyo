import { z } from "zod"
import { route } from "@/lib/api"
import { stopRun } from "@/lib/run-registry"

/** Stop (plan F15): ends a run that is still planning, writing or verifying. */
export const POST = route<{ runId: string }>(async ({ userId, params }) => ({
  stopped: stopRun(z.uuid().parse(params.runId), userId),
}))

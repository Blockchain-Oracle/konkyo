import { db, schema } from "@konkyo/db"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { route } from "@/lib/api"
import { stopDeep } from "@/lib/deep"
import { stopRun } from "@/lib/run-registry"

/** Stop (plan F15, F19): ends an answer in this process, or a deep search in the worker. */
export const POST = route<{ runId: string }>(async ({ userId, params }) => {
  const runId = z.uuid().parse(params.runId)
  const run = await db.query.runs.findFirst({
    columns: { kind: true },
    where: and(eq(schema.runs.id, runId), eq(schema.runs.ownerId, userId)),
  })
  return { stopped: run?.kind === "deep" ? await stopDeep(userId, runId) : stopRun(runId, userId) }
})

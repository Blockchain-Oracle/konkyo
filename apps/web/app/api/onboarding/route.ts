import { z } from "zod"
import { route } from "@/lib/api"
import { runStarter, type StarterPath } from "@/lib/starters"

/** Run a starter task for real: Study, Research or Write. */
export const POST = route<Record<string, never>, { path: StarterPath }>(
  async ({ userId, body }) => runStarter(userId, body.path),
  z.object({ path: z.enum(["study", "research", "write"]) }),
)

import { z } from "zod"
import { route } from "@/lib/api"
import { listVersions, nameVersion } from "@/lib/notes"

export const GET = route<{ id: string }>(async ({ userId, params }) => ({
  versions: await listVersions(userId, z.uuid().parse(params.id)),
}))

/** "Save version" with a name (F24). */
export const POST = route<{ id: string }, { name: string }>(
  async ({ userId, params, body }) => nameVersion(userId, z.uuid().parse(params.id), body.name),
  z.object({ name: z.string().trim().min(1).max(120) }),
)

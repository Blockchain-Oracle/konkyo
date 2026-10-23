import { z } from "zod"
import { route } from "@/lib/api"
import { restoreVersion } from "@/lib/notes"

export const POST = route<{ id: string; vid: string }>(async ({ userId, params }) =>
  restoreVersion(userId, z.uuid().parse(params.id), z.uuid().parse(params.vid)),
)

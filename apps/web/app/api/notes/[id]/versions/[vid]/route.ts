import { z } from "zod"
import { route } from "@/lib/api"
import { getVersion } from "@/lib/notes"

/** A version's content, for its preview. */
export const GET = route<{ id: string; vid: string }>(async ({ userId, params }) =>
  getVersion(userId, z.uuid().parse(params.id), z.uuid().parse(params.vid)),
)

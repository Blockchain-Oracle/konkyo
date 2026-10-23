import { z } from "zod"
import { route } from "@/lib/api"
import { deleteBrief, getBrief } from "@/lib/briefs"

export const GET = route<{ id: string }>(async ({ userId, params }) =>
  getBrief(userId, z.uuid().parse(params.id)),
)

export const DELETE = route<{ id: string }>(async ({ userId, params }) =>
  deleteBrief(userId, z.uuid().parse(params.id)),
)

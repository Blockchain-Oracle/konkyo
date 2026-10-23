import { z } from "zod"
import { route } from "@/lib/api"
import { setItemStatus } from "@/lib/study"

export const POST = route<{ id: string }>(async ({ userId, params }) =>
  setItemStatus(userId, z.uuid().parse(params.id), "active"),
)

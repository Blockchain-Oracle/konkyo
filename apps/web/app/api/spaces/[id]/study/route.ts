import { z } from "zod"
import { route } from "@/lib/api"
import { spaceStudy } from "@/lib/study"

/** This space's practice for you: how many items, and how many are due today (the wall, F46). */
export const GET = route<{ id: string }>(async ({ userId, params }) =>
  spaceStudy(userId, z.uuid().parse(params.id)),
)

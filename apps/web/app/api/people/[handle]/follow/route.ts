import { z } from "zod"
import { route } from "@/lib/api"
import { follow, unfollow } from "@/lib/people"

const handle = (params: { handle: string }) =>
  z
    .string()
    .regex(/^[a-z0-9_]{1,24}$/i)
    .parse(params.handle)

/** Follow someone (a kept account, 100 a day); answers with where you stand and their counts. */
export const POST = route<{ handle: string }>(async ({ userId, params }) =>
  follow(userId, handle(params)),
)

export const DELETE = route<{ handle: string }>(async ({ userId, params }) =>
  unfollow(userId, handle(params)),
)

import { route } from "@/lib/api"
import { knows } from "@/lib/knows"

/** What Konkyo knows: `?space=<id>` for one space, else the whole library. */
export const GET = route(async ({ userId, request }) =>
  knows(userId, new URL(request.url).searchParams.get("space")),
)

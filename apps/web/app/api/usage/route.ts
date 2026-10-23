import { route } from "@/lib/api"
import { usageOf } from "@/lib/usage"

export const GET = route(async ({ userId }) => usageOf(userId))

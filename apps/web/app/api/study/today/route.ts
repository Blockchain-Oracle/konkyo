import { route } from "@/lib/api"
import { todaySummary } from "@/lib/study"

/** Today's review and the streak (Home and Study). */
export const GET = route(async ({ userId }) => todaySummary(userId))

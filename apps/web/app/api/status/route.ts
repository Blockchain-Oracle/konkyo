import { route } from "@/lib/api"
import { liveStatus } from "@/lib/status"

/** The live pill: sources being read, runs working, the last checked answer. */
export const GET = route(async ({ userId }) => liveStatus(userId))

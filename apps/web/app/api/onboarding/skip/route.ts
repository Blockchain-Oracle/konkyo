import { route } from "@/lib/api"
import { markOnboarded } from "@/lib/settings"

/** "I'll add my own": first run ends without a starter. */
export const POST = route(async ({ userId }) => markOnboarded(userId))

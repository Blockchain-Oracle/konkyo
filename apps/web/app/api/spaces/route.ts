import { route } from "@/lib/api"
import { listSpaces } from "@/lib/spaces"

/** Your spaces with their identity and real covers (the rail, Home, Library). */
export const GET = route(async ({ userId }) => ({ spaces: await listSpaces(userId) }))

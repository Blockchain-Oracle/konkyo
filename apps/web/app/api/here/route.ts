import { publicRoute } from "@/lib/api"
import { hereNow } from "@/lib/profiles"

/** The enter card's "N here right now": a count and up to five looks, nothing that names anyone. */
export const GET = publicRoute(async () => hereNow())

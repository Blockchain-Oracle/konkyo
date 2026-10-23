import { vapidPublicKey } from "@konkyo/notify"
import { route } from "@/lib/api"

/** The VAPID public key the browser subscribes with (null: push isn't set up here). */
export const GET = route(async () => ({ key: vapidPublicKey() }))

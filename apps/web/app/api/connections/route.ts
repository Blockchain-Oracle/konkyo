import { TOOLKITS } from "@konkyo/connectors"
import { env } from "@konkyo/env/server"
import { z } from "zod"
import { route } from "@/lib/api"
import { connect, listConnections } from "@/lib/connections"
import { LibraryError } from "@/lib/library"
import { getSession } from "@/lib/session"

/** Settings → Connectors: what's connected, and whether this server and person can connect. */
export const GET = route(async ({ userId }) => {
  const session = await getSession()
  return {
    available: Boolean(env.COMPOSIO_API_KEY),
    guest: Boolean(session?.user.isAnonymous),
    connections: await listConnections(userId),
  }
})

/** Connect (or reconnect) a toolkit: a hosted sign-in link to open. */
export const POST = route<Record<string, never>, { toolkit: (typeof TOOLKITS)[number] }>(
  async ({ userId, body }) => {
    // A connected account belongs to one Konkyo person; a guest who later signs in becomes a
    // different one, so connecting waits for a Google account.
    const session = await getSession()
    if (session?.user.isAnonymous)
      throw new LibraryError(
        "Keep this library first (your card in the rail), then connect your accounts",
        403,
      )
    return connect(userId, body.toolkit)
  },
  z.object({ toolkit: z.enum(TOOLKITS) }),
)

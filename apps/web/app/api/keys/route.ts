import { z } from "zod"
import { route } from "@/lib/api"
import { createKey, listKeys } from "@/lib/api-keys"
import { LibraryError } from "@/lib/library"
import { getSession } from "@/lib/session"

/** Settings → API keys: the person's keys (their first characters only). */
export const GET = route(async ({ userId }) => ({ keys: await listKeys(userId) }))

/** A new key, shown once. Guests can't make one: a guest session ends, its keys with it. */
export const POST = route<Record<string, never>, { name: string }>(
  async ({ userId, body }) => {
    const session = await getSession()
    if (session?.user.isAnonymous)
      throw new LibraryError("Continue with Google first, then make an API key", 403)
    return createKey(userId, body.name)
  },
  z.object({ name: z.string().max(60) }),
)

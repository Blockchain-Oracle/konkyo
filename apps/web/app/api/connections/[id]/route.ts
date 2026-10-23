import { z } from "zod"
import { route } from "@/lib/api"
import { checkConnection, disconnect, setWatch } from "@/lib/connections"

const connectionId = (params: { id: string }) => z.uuid().parse(params.id)

/** Where a connection stands (Settings polls this while the sign-in tab is open). */
export const GET = route<{ id: string }>(async ({ userId, params }) =>
  checkConnection(userId, connectionId(params)),
)

/** Gmail's watch: a search whose new matches come in by themselves, into a folder. */
export const PATCH = route<{ id: string }, { watchQuery: string | null; folderId?: string | null }>(
  async ({ userId, params, body }) => {
    await setWatch(userId, connectionId(params), body)
  },
  z.object({
    watchQuery: z.string().max(300).nullable(),
    folderId: z.uuid().nullable().optional(),
  }),
)

/** Disconnect: access is revoked; what came from it is kept or moved to Trash. */
export const DELETE = route<{ id: string }, { keepFiles: boolean }>(
  async ({ userId, params, body }) => {
    await disconnect(userId, connectionId(params), body.keepFiles)
  },
  z.object({ keepFiles: z.boolean() }),
)

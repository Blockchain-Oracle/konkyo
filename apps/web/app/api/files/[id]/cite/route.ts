import { z } from "zod"
import { route } from "@/lib/api"
import { citePassage } from "@/lib/export-note"
import { LibraryError } from "@/lib/library"
import { getSettings } from "@/lib/settings"

/** A passage cited in the person's own style (the source pane's Cite, plan F08). */
export const POST = route<{ id: string }, { page?: number }>(
  async ({ userId, params, body }) => {
    const { citationStyle } = await getSettings(userId)
    const cited = await citePassage(userId, z.uuid().parse(params.id), citationStyle, body.page)
    if (!cited) throw new LibraryError("No such file", 404)
    return cited
  },
  z.object({ page: z.number().int().min(1).max(100_000).optional() }),
)

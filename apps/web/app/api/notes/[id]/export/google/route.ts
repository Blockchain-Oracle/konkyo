import { z } from "zod"
import { route } from "@/lib/api"
import { exportToGoogleDocs } from "@/lib/google-docs"
import { getSettings } from "@/lib/settings"

/**
 * Export to Google Docs (plan F26): { url } when done, or { needsScope } when the person has
 * to allow Drive access first (the editor then asks Google, and comes back to finish).
 */
export const POST = route<{ id: string }, { style?: string }>(
  async ({ userId, params, body }) => {
    const style = body.style ?? (await getSettings(userId)).citationStyle
    return exportToGoogleDocs(userId, z.uuid().parse(params.id), style)
  },
  z.object({
    style: z
      .string()
      .regex(/^[a-z0-9-]{2,120}$/)
      .optional(),
  }),
)

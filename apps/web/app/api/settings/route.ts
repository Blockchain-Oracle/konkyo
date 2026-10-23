import { z } from "zod"
import { route } from "@/lib/api"
import { getSettings, type Settings, updateSettings } from "@/lib/settings"

export const GET = route(async ({ userId }) => getSettings(userId))

export const PATCH = route<Record<string, never>, Partial<Settings>>(
  async ({ userId, body }) => updateSettings(userId, body),
  z.object({
    autoImportSources: z.boolean().optional(),
    citationStyle: z
      .string()
      .regex(/^[a-z0-9-]{2,120}$/)
      .optional(),
  }),
)

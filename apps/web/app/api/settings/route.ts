import { VOICE } from "@konkyo/config"
import { z } from "zod"
import { route } from "@/lib/api"
import { getSettings, type Settings, updateSettings } from "@/lib/settings"

export const GET = route(async ({ userId }) => getSettings(userId))

export const PATCH = route<Record<string, never>, Partial<Omit<Settings, "canEmail">>>(
  async ({ userId, body }) => updateSettings(userId, body),
  z.object({
    autoImportSources: z.boolean().optional(),
    studySound: z.boolean().optional(),
    dailyNew: z.number().int().min(0).max(100).optional(),
    reviewReminders: z.boolean().optional(),
    reminderHour: z.number().int().min(0).max(23).optional(),
    interfaceSounds: z.boolean().optional(),
    readAloud: z.boolean().optional(),
    weeklyDigest: z.boolean().optional(),
    voiceId: z
      .string()
      .refine((id) => VOICE.voices.some((voice) => voice.id === id))
      .optional(),
    citationStyle: z
      .string()
      .regex(/^[a-z0-9-]{2,120}$/)
      .optional(),
  }),
)

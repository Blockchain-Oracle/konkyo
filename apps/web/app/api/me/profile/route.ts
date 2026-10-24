import { LOOKS, type LookId, PEOPLE } from "@konkyo/config"
import { z } from "zod"
import { route } from "@/lib/api"
import { getMe, type ProfilePatch, updateProfile } from "@/lib/profiles"

const lookIds = LOOKS.map((look) => look.id) as [LookId, ...LookId[]]

/** You (F53, F54): your name, look, photo choice, and for a kept account your handle and bio. */
export const GET = route(async ({ userId }) => getMe(userId))

export const PATCH = route<Record<string, never>, ProfilePatch>(
  async ({ userId, body }) => updateProfile(userId, body),
  z.object({
    name: z.string().trim().min(1).max(PEOPLE.nameMax).optional(),
    lookId: z.enum(lookIds).optional(),
    avatar: z.enum(["look", "photo", "google"]).optional(),
    handle: z
      .string()
      .trim()
      .toLowerCase()
      .regex(new RegExp(PEOPLE.handlePattern))
      .nullable()
      .optional(),
    bio: z.string().trim().max(PEOPLE.bioMax).nullable().optional(),
  }),
)

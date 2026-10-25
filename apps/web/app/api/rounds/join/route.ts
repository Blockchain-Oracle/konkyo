import { ROUNDS } from "@konkyo/config"
import { z } from "zod"
import { route } from "@/lib/api"
import { joinByCode } from "@/lib/rounds"
import { visitorOf } from "@/lib/shares"

/** Sit down in a round with its code (guests too); wrong codes are counted against guessing. */
export const POST = route<Record<string, never>, { code: string }>(
  async ({ userId, request, body }) => {
    // an unknown address isn't a key: everyone without one would share its count
    const known = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip")
    return joinByCode(userId, body.code, known ? visitorOf(request) : null)
  },
  z.object({ code: z.string().trim().length(ROUNDS.codeLength) }),
)

import { z } from "zod"
import { route } from "@/lib/api"
import { addTake, listTakes, TAKE_MAX, takeCounts } from "@/lib/takes"

const spaceId = (params: { id: string }) => z.uuid().parse(params.id)

/** `?file=` one source's takes; otherwise how many each source has. */
export const GET = route<{ id: string }>(async ({ userId, params, request }) => {
  const file = new URL(request.url).searchParams.get("file")
  if (file) return { takes: await listTakes(userId, spaceId(params), z.uuid().parse(file)) }
  return { counts: await takeCounts(userId, spaceId(params)) }
})

/** Your take on a source in the space. */
export const POST = route<
  { id: string },
  { fileId: string; body: string; passageId?: string; page?: number }
>(
  async ({ userId, params, body }) => ({ takes: await addTake(userId, spaceId(params), body) }),
  z.object({
    fileId: z.uuid(),
    body: z.string().trim().min(1).max(TAKE_MAX),
    passageId: z.uuid().optional(),
    page: z.number().int().min(1).optional(),
  }),
)

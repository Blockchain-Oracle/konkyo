import { route } from "@/lib/api"
import { handleProblem } from "@/lib/profiles"

/** Is this handle free for me? Asked as you type one (debounced). */
export const GET = route(async ({ userId, request }) => {
  const handle = (new URL(request.url).searchParams.get("h") ?? "").trim().toLowerCase()
  const problem = await handleProblem(handle, userId)
  return { handle, ok: problem === null, problem }
})

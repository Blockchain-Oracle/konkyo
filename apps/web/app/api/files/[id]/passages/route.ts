import { route } from "@/lib/api"
import { listPassages } from "@/lib/library"

/** `?page=n` limits the list to one page. */
export const GET = route<{ id: string }>(async ({ userId, params, request }) => {
  const page = new URL(request.url).searchParams.get("page")
  return listPassages(userId, params.id, page ? Number(page) : undefined)
})

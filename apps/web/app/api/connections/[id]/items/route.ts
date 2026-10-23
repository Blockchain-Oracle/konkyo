import { z } from "zod"
import { route } from "@/lib/api"
import { browse } from "@/lib/connections"

/** One page of the account's items for the import picker (?q= searches, ?page= continues). */
export const GET = route<{ id: string }>(async ({ userId, params, request }) => {
  const url = new URL(request.url)
  const query = (url.searchParams.get("q") ?? "").slice(0, 300)
  return browse(userId, z.uuid().parse(params.id), query, url.searchParams.get("page") ?? undefined)
})

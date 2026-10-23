import { z } from "zod"
import { publicRoute } from "@/lib/api"
import { publicPassages } from "@/lib/shares"

export const GET = publicRoute<{ slug: string; fileId: string }>(async ({ params, request }) => {
  const page = new URL(request.url).searchParams.get("page")
  return publicPassages(
    params.slug,
    z.uuid().parse(params.fileId),
    page ? z.coerce.number().int().min(1).parse(page) : undefined,
  )
})

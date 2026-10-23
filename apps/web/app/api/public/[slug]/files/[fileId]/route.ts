import { z } from "zod"
import { publicRoute } from "@/lib/api"
import { publicFile } from "@/lib/shares"

export const GET = publicRoute<{ slug: string; fileId: string }>(async ({ params }) =>
  publicFile(params.slug, z.uuid().parse(params.fileId)),
)

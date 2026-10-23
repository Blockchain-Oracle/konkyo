import { z } from "zod"
import { route } from "@/lib/api"
import { signUpload } from "@/lib/library"

/** Uppy 6 `signRequest`: one presigned URL per S3 call, only for this person's own uploads. */
export const POST = route(
  async ({ userId, body }) => signUpload(userId, body),
  z.object({
    method: z.enum(["PUT", "POST", "GET", "DELETE"]),
    key: z.string().min(1).max(600),
    uploadId: z.string().max(300).optional(),
    partNumber: z.number().int().min(1).max(10_000).optional(),
  }),
)

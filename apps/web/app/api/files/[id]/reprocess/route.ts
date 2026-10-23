import { route } from "@/lib/api"
import { retryFile } from "@/lib/library"

/** Re-process (plan F06): reads the file again from scratch (extraction, OCR, details). */
export const POST = route<{ id: string }>(async ({ userId, params }) =>
  retryFile(userId, params.id),
)

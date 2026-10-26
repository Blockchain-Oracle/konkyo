import type { FileMeta } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { imageThumb, pdfThumb, youTubeThumbUrl } from "@konkyo/ingest"
import { enqueue } from "@konkyo/jobs"
import { getBytes, objectKey, putBytes } from "@konkyo/storage"
import { and, eq, isNull } from "drizzle-orm"

const { files } = schema

/** The id in a YouTube link (watch?v=…, youtu.be/…, /shorts/…). */
function youTubeId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.endsWith("youtu.be")) return u.pathname.slice(1) || null
    return u.searchParams.get("v") ?? /\/(?:shorts|embed)\/([\w-]+)/.exec(u.pathname)?.[1] ?? null
  } catch {
    return null
  }
}

/**
 * A source's polaroid for the wall: a video's own thumbnail, a web
 * page's og:image, else page one of its PDF. Audio and plain text get none (the wall draws them).
 */
export async function makeThumb(fileId: string) {
  const [file] = await db.select().from(files).where(eq(files.id, fileId))
  if (!file || file.deletedAt || file.status !== "ready") return
  const meta = file.meta as FileMeta | null
  let bytes: Uint8Array | null = null

  const videoId = file.kind === "youtube" && file.sourceUrl ? youTubeId(file.sourceUrl) : null
  if (videoId) bytes = await imageThumb(youTubeThumbUrl(videoId)).catch(() => null)
  if (!bytes && meta?.ogImage) bytes = await imageThumb(meta.ogImage).catch(() => null)
  if (!bytes) {
    const pdfKey = file.renditionKey ?? (file.kind === "pdf" ? file.originalKey : null)
    if (pdfKey) bytes = await pdfThumb(await getBytes(pdfKey))
  }
  if (!bytes) return

  const key = objectKey("pages", fileId, "1.webp")
  await putBytes(key, bytes, "image/webp")
  await db.update(files).set({ thumbKey: key }).where(eq(files.id, fileId))
}

/** Sources read before polaroids existed get one (runs at worker start; at most `limit`). */
export async function backfillThumbs(limit = 500) {
  const rows = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.status, "ready"), isNull(files.thumbKey), isNull(files.deletedAt)))
    .limit(limit)
  for (const row of rows) await enqueue("thumb", { fileId: row.id }, row.id)
  return rows.length
}

/**
 * Push one real file or URL through the ingest pipeline, outside the queue:
 *   pnpm --filter @konkyo/worker ingest <path-or-url> --owner <email>
 * Prints each stage the library would show, then the passage count Zetaris confirmed.
 */
import { readFile } from "node:fs/promises"
import { basename, extname } from "node:path"
import { db, schema } from "@konkyo/db"
import { isYouTube } from "@konkyo/ingest"
import { objectKey, putBytes } from "@konkyo/storage"
import { eq } from "drizzle-orm"
import { ingestFile } from "./pipeline"

const args = process.argv.slice(2)
const target = args.find((a) => !a.startsWith("--"))
const ownerEmail = args[args.indexOf("--owner") + 1]
if (!target || !ownerEmail) {
  console.error("usage: ingest <path-or-url> --owner <email>")
  process.exit(2)
}

const owner = await db.query.user.findFirst({ where: eq(schema.user.email, ownerEmail) })
if (!owner) throw new Error(`No user with email ${ownerEmail}`)

const KIND_BY_EXT: Record<string, (typeof schema.fileKind.enumValues)[number]> = {
  ".pdf": "pdf",
  ".docx": "docx",
  ".pptx": "pptx",
  ".md": "markdown",
  ".txt": "text",
  ".mp3": "audio",
  ".m4a": "audio",
  ".wav": "audio",
  ".mp4": "video",
}

let id: string
if (/^https?:\/\//.test(target)) {
  const [row] = await db
    .insert(schema.files)
    .values({
      ownerId: owner.id,
      title: target,
      kind: isYouTube(target) ? "youtube" : "web",
      sourceUrl: target,
    })
    .returning()
  id = (row as { id: string }).id
} else {
  const kind = KIND_BY_EXT[extname(target).toLowerCase()]
  if (!kind) throw new Error(`Unsupported file type: ${extname(target)}`)
  const bytes = new Uint8Array(await readFile(target))
  const [row] = await db
    .insert(schema.files)
    .values({ ownerId: owner.id, title: basename(target), kind, sizeBytes: bytes.length })
    .returning()
  id = (row as { id: string }).id
  const key = objectKey("originals", owner.id, id, basename(target))
  await putBytes(key, bytes, "application/octet-stream")
  await db.update(schema.files).set({ originalKey: key }).where(eq(schema.files.id, id))
}

const started = performance.now()
const poll = setInterval(async () => {
  const f = await db.query.files.findFirst({ where: eq(schema.files.id, id) })
  if (f?.stage) console.info(`  · ${f.stage}`)
}, 1500)
try {
  await ingestFile(id)
} catch (error) {
  console.error("  ✗", (error as Error).message)
} finally {
  clearInterval(poll)
}
const done = await db.query.files.findFirst({ where: eq(schema.files.id, id) })
const count = await db.$count(schema.passages, eq(schema.passages.fileId, id))
console.info(
  JSON.stringify({
    id,
    status: done?.status,
    problem: done?.problem,
    detail: done?.problemDetail,
    title: done?.title,
    passages: count,
    fromScan: done?.fromScan,
    pages: done?.pageCount,
    ms: Math.round(performance.now() - started),
  }),
)
process.exit(0)

import { TRASH } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { deleteObject } from "@konkyo/storage"
import { unpublish } from "@konkyo/zetaris"
import { lt } from "drizzle-orm"

const { files, folders } = schema

/** Removes deleted files' stored bytes and Zetaris evidence. Safe to repeat. */
export async function purgeFiles({ fileIds, keys }: { fileIds: string[]; keys: string[] }) {
  await Promise.all(keys.map((key) => deleteObject(key)))
  await Promise.all(fileIds.map((id) => unpublish(id)))
}

/** The daily sweep: anything in Trash longer than the keep period is deleted for good. */
export async function purgeExpired() {
  const cutoff = new Date(Date.now() - TRASH.keepDays * 86_400_000)
  const gone = await db
    .delete(files)
    .where(lt(files.deletedAt, cutoff))
    .returning({ id: files.id, originalKey: files.originalKey, renditionKey: files.renditionKey })
  await db.delete(folders).where(lt(folders.deletedAt, cutoff))
  await purgeFiles({
    fileIds: gone.map((f) => f.id),
    keys: gone.flatMap((f) => [f.originalKey, f.renditionKey].filter((k): k is string => !!k)),
  })
  return gone.length
}

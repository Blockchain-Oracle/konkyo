import "server-only"
import { randomUUID } from "node:crypto"
import { TRASH } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { enqueue } from "@konkyo/jobs"
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm"
import { LibraryError } from "./library"

const { folders, files } = schema

/** One file to Trash (or several); each trashing is its own batch, restored on its own. */
export async function trashFiles(ownerId: string, fileIds: string[]) {
  const batch = randomUUID()
  await db
    .update(files)
    .set({ deletedAt: new Date(), trashBatch: batch })
    .where(and(eq(files.ownerId, ownerId), inArray(files.id, fileIds)))
  return { batch }
}

/**
 * What Trash shows: one row per thing the person deleted. A folder stands for its whole batch
 * (subfolders and files inside); a file deleted on its own is its own row.
 */
export async function listTrash(ownerId: string) {
  const rows = await db.execute<{
    batch: string
    type: "folder" | "file"
    id: string
    name: string
    kind: string | null
    deleted_at: string
    files: number
  }>(sql`
    select f.trash_batch as batch, 'folder' as type, f.id, f.name, null as kind, f.deleted_at,
      (select count(*)::int from ${files} x where x.trash_batch = f.trash_batch) as files
    from ${folders} f
    where f.owner_id = ${ownerId} and f.deleted_at is not null and f.trash_batch is not null
      and not exists (
        select 1 from ${folders} p where p.id = f.parent_id and p.trash_batch = f.trash_batch
      )
    union all
    select x.trash_batch, 'file', x.id, x.title, x.kind::text, x.deleted_at, 1
    from ${files} x
    where x.owner_id = ${ownerId} and x.deleted_at is not null
      and not exists (select 1 from ${folders} f where f.trash_batch = x.trash_batch)
    order by deleted_at desc
  `)
  return rows.map((r) => ({
    batch: r.batch,
    type: r.type,
    id: r.id,
    name: r.name,
    kind: r.kind,
    deletedAt: new Date(r.deleted_at).toISOString(),
    purgeAt: new Date(new Date(r.deleted_at).getTime() + TRASH.keepDays * 86_400_000).toISOString(),
    files: r.files,
  }))
}

export type TrashItem = Awaited<ReturnType<typeof listTrash>>[number]

/** Brings a batch back. A folder whose parent is still in Trash returns to the top level. */
export async function restoreBatch(ownerId: string, batch: string) {
  await db.transaction(async (tx) => {
    const restored = await tx
      .update(folders)
      .set({ deletedAt: null, trashBatch: null })
      .where(and(eq(folders.ownerId, ownerId), eq(folders.trashBatch, batch)))
      .returning({ id: folders.id })
    const restoredFiles = await tx
      .update(files)
      .set({ deletedAt: null, trashBatch: null })
      .where(and(eq(files.ownerId, ownerId), eq(files.trashBatch, batch)))
      .returning({ id: files.id })
    if (!restored.length && !restoredFiles.length)
      throw new LibraryError("That's no longer in Trash", 404)
    await tx.execute(sql`
      update ${folders} f set parent_id = null
      where f.owner_id = ${ownerId} and f.trash_batch is null and f.parent_id is not null
        and exists (select 1 from ${folders} p where p.id = f.parent_id and p.deleted_at is not null)
    `)
  })
}

/**
 * Deleted for good: the rows go now (passages and folder links cascade), and the stored bytes
 * and Zetaris evidence are removed by the worker, which owns the evidence volume.
 */
export async function deleteBatches(ownerId: string, batches: string[]) {
  if (!batches.length) return
  const gone = await db.transaction(async (tx) => {
    const removedFiles = await tx
      .delete(files)
      .where(and(eq(files.ownerId, ownerId), inArray(files.trashBatch, batches)))
      .returning({ id: files.id, originalKey: files.originalKey, renditionKey: files.renditionKey })
    await tx
      .delete(folders)
      .where(and(eq(folders.ownerId, ownerId), inArray(folders.trashBatch, batches)))
    return removedFiles
  })
  if (gone.length) {
    await enqueue("purge", {
      fileIds: gone.map((f) => f.id),
      keys: gone.flatMap((f) => [f.originalKey, f.renditionKey].filter((k): k is string => !!k)),
    })
  }
}

export async function emptyTrash(ownerId: string) {
  const rows = await db
    .selectDistinct({ batch: files.trashBatch })
    .from(files)
    .where(and(eq(files.ownerId, ownerId), isNotNull(files.trashBatch)))
  const folderRows = await db
    .selectDistinct({ batch: folders.trashBatch })
    .from(folders)
    .where(and(eq(folders.ownerId, ownerId), isNotNull(folders.trashBatch)))
  const batches = [...new Set([...rows, ...folderRows].map((r) => r.batch as string))]
  await deleteBatches(ownerId, batches)
}

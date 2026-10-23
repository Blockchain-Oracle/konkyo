import "server-only"
import { randomUUID } from "node:crypto"
import { db, schema } from "@konkyo/db"
import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm"
import { LibraryError } from "./library"

const { folders, files, fileFolders } = schema

export const FOLDER_NAME_MAX = 120

function cleanName(raw: string) {
  const name = raw.replace(/\s+/g, " ").trim()
  if (!name) throw new LibraryError("A folder needs a name")
  if (name.length > FOLDER_NAME_MAX) throw new LibraryError("That name is too long")
  return name
}

/** Every folder of a person, flat (the sidebar builds the tree), with its file count. */
export async function listFolders(ownerId: string) {
  return db
    .select({
      id: folders.id,
      parentId: folders.parentId,
      name: folders.name,
      // Aliased by hand: in a one-table select Drizzle prints columns unqualified, so
      // `${folders.id}` would bind to the inner `files.id` and every count came out 0.
      fileCount: sql<number>`(
        select count(*)::int from ${fileFolders} ff
        join ${files} x on x.id = ff.file_id
        where ff.folder_id = ${folders}.id and x.deleted_at is null
      )`,
    })
    .from(folders)
    .where(and(eq(folders.ownerId, ownerId), isNull(folders.deletedAt)))
    .orderBy(folders.name)
}

export type FolderRow = Awaited<ReturnType<typeof listFolders>>[number]

async function ownFolder(ownerId: string, folderId: string) {
  const folder = await db.query.folders.findFirst({
    where: and(eq(folders.id, folderId), eq(folders.ownerId, ownerId), isNull(folders.deletedAt)),
  })
  if (!folder) throw new LibraryError("No such folder", 404)
  return folder
}

/** The folder and every folder inside it (ids), for moves and Trash. */
async function subtree(ownerId: string, folderId: string): Promise<string[]> {
  const rows = await db.execute<{ id: string }>(sql`
    with recursive tree as (
      select id from ${folders} where id = ${folderId} and owner_id = ${ownerId}
      union all
      select f.id from ${folders} f join tree t on f.parent_id = t.id where f.deleted_at is null
    )
    select id from tree
  `)
  return rows.map((r) => r.id)
}

/** The chain from the top level down to this folder, for breadcrumbs. */
export async function folderPath(ownerId: string, folderId: string) {
  const rows = await db.execute<{ id: string; name: string; depth: number }>(sql`
    with recursive up as (
      select id, name, parent_id, 0 as depth from ${folders}
      where id = ${folderId} and owner_id = ${ownerId} and deleted_at is null
      union all
      select f.id, f.name, f.parent_id, up.depth + 1 from ${folders} f join up on f.id = up.parent_id
    )
    select id, name, depth from up order by depth desc
  `)
  if (!rows.length) throw new LibraryError("No such folder", 404)
  return rows.map(({ id, name }) => ({ id, name }))
}

export async function createFolder(ownerId: string, rawName: string, parentId?: string | null) {
  const name = cleanName(rawName)
  if (parentId) await ownFolder(ownerId, parentId)
  const [folder] = await db
    .insert(folders)
    .values({ ownerId, name, parentId: parentId ?? null })
    .returning({ id: folders.id, name: folders.name, parentId: folders.parentId })
  if (!folder) throw new LibraryError("Couldn't create the folder", 500)
  return folder
}

export async function renameFolder(ownerId: string, folderId: string, rawName: string) {
  await ownFolder(ownerId, folderId)
  await db
    .update(folders)
    .set({ name: cleanName(rawName) })
    .where(eq(folders.id, folderId))
}

/** Moves a folder under another (or to the top level); never into itself or its own subfolders. */
export async function moveFolder(ownerId: string, folderId: string, parentId: string | null) {
  await ownFolder(ownerId, folderId)
  if (parentId) {
    await ownFolder(ownerId, parentId)
    if ((await subtree(ownerId, folderId)).includes(parentId))
      throw new LibraryError("A folder can't go inside itself")
  }
  await db.update(folders).set({ parentId }).where(eq(folders.id, folderId))
}

/** Files go to one folder (or out of every folder, back to the library's top level). */
export async function moveFiles(ownerId: string, fileIds: string[], folderId: string | null) {
  if (folderId) await ownFolder(ownerId, folderId)
  const owned = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.ownerId, ownerId), inArray(files.id, fileIds)))
  const ids = owned.map((f) => f.id)
  if (!ids.length) return
  await db.transaction(async (tx) => {
    await tx.delete(fileFolders).where(inArray(fileFolders.fileId, ids))
    if (folderId) await tx.insert(fileFolders).values(ids.map((fileId) => ({ fileId, folderId })))
  })
}

/**
 * A folder to Trash with everything in it: its subfolders, and the files that live only inside
 * it (a file also filed elsewhere stays). All share one batch id, so Restore brings them back
 * together.
 */
export async function trashFolder(ownerId: string, folderId: string) {
  await ownFolder(ownerId, folderId)
  const ids = await subtree(ownerId, folderId)
  const batch = randomUUID()
  const now = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(folders)
      .set({ deletedAt: now, trashBatch: batch })
      .where(and(inArray(folders.id, ids), isNull(folders.deletedAt)))
    const inside = tx
      .select({ fileId: fileFolders.fileId })
      .from(fileFolders)
      .where(inArray(fileFolders.folderId, ids))
    const elsewhere = tx
      .select({ fileId: fileFolders.fileId })
      .from(fileFolders)
      .where(notInArray(fileFolders.folderId, ids))
    await tx
      .update(files)
      .set({ deletedAt: now, trashBatch: batch })
      .where(
        and(
          eq(files.ownerId, ownerId),
          isNull(files.deletedAt),
          inArray(files.id, inside),
          notInArray(files.id, elsewhere),
        ),
      )
  })
  return { batch }
}

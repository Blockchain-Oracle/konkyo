import { deleteMemoryOf, deleteWorldOf } from "@konkyo/agents"
import { TRASH } from "@konkyo/config"
import { removeAccount } from "@konkyo/connectors"
import { db, schema } from "@konkyo/db"
import { deleteUserRows } from "@konkyo/db/owned"
import type { Payload } from "@konkyo/jobs"
import { deleteObject } from "@konkyo/storage"
import { dropWatchTable, unpublish } from "@konkyo/zetaris"
import { lt, sql } from "drizzle-orm"

const { files, folders, chats } = schema

/**
 * Removes deleted files' stored bytes and Zetaris evidence; for a deleted account, also its
 * watch tables and memory files. Safe to repeat.
 */
export async function purgeFiles({
  fileIds,
  keys,
  tables = [],
  accounts = [],
  ownerId,
}: Payload<"purge">) {
  await Promise.all(keys.map((key) => deleteObject(key)))
  await Promise.all(fileIds.map((id) => unpublish(id)))
  await Promise.all(tables.map((table) => dropWatchTable(table)))
  await Promise.all(accounts.map((account) => removeAccount(account)))
  if (ownerId) await Promise.all([deleteMemoryOf(ownerId), deleteWorldOf(ownerId)])
}

/** The daily sweep: anything in Trash longer than the keep period is deleted for good. */
export async function purgeExpired() {
  const cutoff = new Date(Date.now() - TRASH.keepDays * 86_400_000)
  const gone = await db
    .delete(files)
    .where(lt(files.deletedAt, cutoff))
    .returning({ id: files.id, originalKey: files.originalKey, renditionKey: files.renditionKey })
  await db.delete(folders).where(lt(folders.deletedAt, cutoff))
  await db.delete(chats).where(lt(chats.deletedAt, cutoff))
  await purgeFiles({
    fileIds: gone.map((f) => f.id),
    keys: gone.flatMap((f) => [f.originalKey, f.renditionKey].filter((k): k is string => !!k)),
  })
  return gone.length
}

/**
 * Guests whose last session has run out (30 days unused): nobody can sign in as them again, so
 * what they made is deleted like an account. Linked guests are already gone (reownUserData).
 */
export async function purgeAbandonedGuests() {
  const rows = await db.execute<{ id: string }>(sql`
    select u.id from "user" u
    where u.is_anonymous and u.created_at < now() - interval '1 day'
      and not exists (select 1 from session s where s.user_id = u.id and s.expires_at > now())
  `)
  for (const { id } of rows) await purgeFiles(await deleteUserRows(db, id))
  return rows.length
}

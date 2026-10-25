import { deleteMemoryOf, deleteSpaceWorld, deleteWorldOf } from "@konkyo/agents"
import { ROUNDS, TRASH } from "@konkyo/config"
import { removeAccount } from "@konkyo/connectors"
import { db, schema } from "@konkyo/db"
import { deleteUserRows } from "@konkyo/db/owned"
import type { Payload } from "@konkyo/jobs"
import { deleteObject, listKeys, objectKey } from "@konkyo/storage"
import { dropWatchTable, unpublish } from "@konkyo/zetaris"
import { lt, sql } from "drizzle-orm"

const { files, folders, chats, liveRounds } = schema

/**
 * Removes deleted files' stored bytes and Zetaris evidence; for a deleted account, also its
 * watch tables, memory files and its articles' pictures. Safe to repeat.
 */
export async function purgeFiles({
  fileIds,
  keys,
  tables = [],
  accounts = [],
  ownerId,
  spaceIds = [],
  articleIds = [],
}: Payload<"purge">) {
  await Promise.all(keys.map((key) => deleteObject(key)))
  for (const id of articleIds)
    await Promise.all(
      (await listKeys(`${objectKey("articles", id)}/`)).map((key) => deleteObject(key)),
    )
  await Promise.all(fileIds.map((id) => unpublish(id)))
  await Promise.all(tables.map((table) => dropWatchTable(table)))
  await Promise.all(accounts.map((account) => removeAccount(account)))
  if (ownerId) await Promise.all([deleteMemoryOf(ownerId), deleteWorldOf(ownerId)])
  await Promise.all(spaceIds.map((id) => deleteSpaceWorld(id)))
}

/**
 * The daily sweep: anything in Trash longer than the keep period is deleted for good, and live
 * rounds left hanging are closed.
 */
export async function purgeExpired() {
  const cutoff = new Date(Date.now() - TRASH.keepDays * 86_400_000)
  const gone = await db
    .delete(files)
    .where(lt(files.deletedAt, cutoff))
    .returning({ id: files.id, originalKey: files.originalKey, renditionKey: files.renditionKey })
  const spaces = await db
    .delete(folders)
    .where(lt(folders.deletedAt, cutoff))
    .returning({ id: folders.id, parentId: folders.parentId })
  // a space gone for good takes its shared World Model with it
  await Promise.all(spaces.filter((f) => !f.parentId).map((f) => deleteSpaceWorld(f.id)))
  await db.delete(chats).where(lt(chats.deletedAt, cutoff))
  // Live rounds (F58): one nobody moved for a while is over; finished ones go after the keep period.
  await db.execute(sql`
    update live_rounds set phase = 'done', ended_at = now(), ends_at = null
    where phase <> 'done' and updated_at < now() - make_interval(mins => ${ROUNDS.idleMinutes})`)
  await db.delete(liveRounds).where(lt(liveRounds.createdAt, cutoff))
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

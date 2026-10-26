import { type SQL, sql } from "drizzle-orm"
import { db } from "./index"
import type { SpaceRole } from "./schema"

/*
 * Who can read and add what. Ownership stays the rule everywhere:
 * every existing `owner_id = me` filter stays. Reading someone else's files happens only through
 * these functions, and only because you're a member of a space they're filed in. Each returns null
 * (or false) when there's no access; the web wraps null into a 404, so a stranger can't tell a
 * private file from a missing one.
 */

export type Role = "owner" | SpaceRole

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * An id list as one Postgres array parameter (`= any($1::uuid[])`), so a big scope is one bound
 * value instead of thousands (postgres-js would spread a JS array into `($1, $2, …)`).
 */
export function uuidArray(ids: readonly string[]): string {
  for (const id of ids) if (!UUID.test(id)) throw new Error(`Not a uuid: ${id}`)
  return `{${ids.join(",")}}`
}

/** Your role in a space (a top-level folder): owner, a member's role, or null. */
export async function spaceRole(userId: string, spaceId: string): Promise<Role | null> {
  if (!UUID.test(spaceId)) return null
  const [row] = await db.execute<{ owner_id: string; role: SpaceRole | null }>(sql`
    select f.owner_id, m.role from folders f
    left join space_members m on m.space_id = f.id and m.user_id = ${userId}
    where f.id = ${spaceId}::uuid and f.parent_id is null and f.deleted_at is null`)
  if (!row) return null
  return row.owner_id === userId ? "owner" : (row.role ?? null)
}

/** Your role in any folder: the role you have in the space it sits in. */
export async function folderRole(userId: string, folderId: string): Promise<Role | null> {
  if (!UUID.test(folderId)) return null
  const [row] = await db.execute<{ owner_id: string; role: SpaceRole | null }>(sql`
    select f.owner_id, m.role from folders f
    left join space_members m on m.space_id = f.space_id and m.user_id = ${userId}
    where f.id = ${folderId}::uuid and f.deleted_at is null`)
  if (!row) return null
  return row.owner_id === userId ? "owner" : (row.role ?? null)
}

/** May you file your own sources into this folder? Its owner, or a member who can add. */
export async function canFileInto(userId: string, folderId: string): Promise<boolean> {
  const role = await folderRole(userId, folderId)
  return role === "owner" || role === "add"
}

/** The spaces you own and the ones you've joined. */
export async function mySpaces(userId: string): Promise<{ spaceId: string; role: Role }[]> {
  const rows = await db.execute<{ id: string; role: Role }>(sql`
    select f.id, 'owner' as role from folders f
    where f.owner_id = ${userId} and f.parent_id is null and f.deleted_at is null
    union all
    select m.space_id, m.role from space_members m
    join folders f on f.id = m.space_id and f.deleted_at is null
    where m.user_id = ${userId}`)
  return rows.map((r) => ({ spaceId: r.id, role: r.role }))
}

/**
 * Whether a file is yours or filed in a space you're a member of. Members read; only the owner
 * changes it. Null when you can't see it at all.
 */
export async function fileAccess(
  userId: string,
  fileId: string,
): Promise<{ ownerId: string; own: boolean; spaceIds: string[] } | null> {
  if (!UUID.test(fileId)) return null
  const [row] = await db.execute<{ owner_id: string; space_ids: string[] | null }>(sql`
    select fi.owner_id, (
      select array_agg(distinct fo.space_id) from file_folders ff
      join folders fo on fo.id = ff.folder_id and fo.deleted_at is null
      where ff.file_id = fi.id and (fo.owner_id = ${userId} or exists (
        select 1 from space_members m where m.space_id = fo.space_id and m.user_id = ${userId}))
    ) as space_ids
    from files fi where fi.id = ${fileId}::uuid and fi.deleted_at is null`)
  if (!row) return null
  const own = row.owner_id === userId
  const spaceIds = row.space_ids ?? []
  if (!own && spaceIds.length === 0) return null
  return { ownerId: row.owner_id, own, spaceIds }
}

/**
 * The condition "this file row is readable by me", for lists that mix owners (⌘K, catch me up):
 * mine, or filed in a space I own or am a member of (a member's file in my space is mine to read).
 * `alias` is the files table's alias in the query.
 */
export function readableFileSql(userId: string, alias = "f"): SQL {
  const a = sql.raw(alias)
  return sql`(${a}.owner_id = ${userId} or exists (
    select 1 from file_folders ff
    join folders fo on fo.id = ff.folder_id and fo.deleted_at is null
    where ff.file_id = ${a}.id and (fo.owner_id = ${userId} or exists (
      select 1 from space_members m where m.space_id = fo.space_id and m.user_id = ${userId}))))`
}

/** Every live file filed anywhere in a space (any owner), optionally only ready ones, or no notes. */
export async function spaceFileIds(
  spaceId: string,
  options: { ready?: boolean; notes?: boolean } = {},
): Promise<string[]> {
  const ready = options.ready ? sql`and fi.status = 'ready'` : sql``
  const notes = options.notes === false ? sql`and fi.kind <> 'note'` : sql``
  const rows = await db.execute<{ id: string }>(sql`
    select distinct fi.id from files fi
    join file_folders ff on ff.file_id = fi.id
    join folders fo on fo.id = ff.folder_id and fo.deleted_at is null
    where fo.space_id = ${spaceId}::uuid and fi.deleted_at is null ${ready} ${notes}`)
  return rows.map((r) => r.id)
}

export type Scope = { fileIds?: string[]; folderIds?: string[] }

/**
 * What an ask (or a practice set, a brief, a suggestion) may search. `fileIds` null means "my whole
 * library", searched with today's owner filter. `crossOwner` means the ids include files other
 * people own, readable because they're filed in a space I'm in; then the id list is the filter.
 * Folders you can't read and files you can't see drop out silently, as if not asked for.
 */
export type Reach = {
  userId: string
  fileIds: string[] | null
  crossOwner: boolean
  /** Set when the files searched are exactly one space (its World Model namespace). */
  spaceId?: string
}

export async function resolveReach(userId: string, scope: Scope = {}): Promise<Reach> {
  const askedFiles = (scope.fileIds ?? []).filter((id) => UUID.test(id))
  const askedFolders = (scope.folderIds ?? []).filter((id) => UUID.test(id))
  if (!askedFiles.length && !askedFolders.length)
    return { userId, fileIds: null, crossOwner: false }

  const ids = new Set<string>()
  let crossOwner = false
  const spaces = new Set<string>()

  if (askedFolders.length) {
    // Each folder with its space, whether it's mine, and whether I'm a member of its space.
    const folders = await db.execute<{
      id: string
      space_id: string | null
      mine: boolean
      member: boolean
    }>(sql`
      select f.id, f.space_id, f.owner_id = ${userId} as mine,
        exists (select 1 from space_members m where m.space_id = f.space_id and m.user_id = ${userId})
          as member
      from folders f
      where f.id = any(${uuidArray(askedFolders)}::uuid[]) and f.deleted_at is null`)
    const readable = folders.filter((f) => f.mine || f.member)
    // In a shared space a folder holds everyone's files; in my own unshared folder, only mine.
    for (const f of readable) {
      if (f.space_id) spaces.add(f.space_id)
      if (f.member) crossOwner = true
    }
    if (readable.length) {
      const rows = await db.execute<{ file_id: string; owner_id: string }>(sql`
        with recursive tree as (
          select id from folders where id = any(${uuidArray(readable.map((f) => f.id))}::uuid[])
          union all
          select f.id from folders f join tree t on f.parent_id = t.id where f.deleted_at is null
        )
        select distinct ff.file_id, fi.owner_id from file_folders ff
        join tree t on ff.folder_id = t.id
        join files fi on fi.id = ff.file_id and fi.deleted_at is null`)
      for (const r of rows) {
        ids.add(r.file_id)
        if (r.owner_id !== userId) crossOwner = true
      }
    }
  }

  if (askedFiles.length) {
    const files = await db.execute<{ id: string; owner_id: string }>(sql`
      select fi.id, fi.owner_id from files fi
      where fi.id = any(${uuidArray(askedFiles)}::uuid[]) and fi.deleted_at is null
        and ${readableFileSql(userId, "fi")}`)
    for (const f of files) {
      ids.add(f.id)
      if (f.owner_id !== userId) crossOwner = true
    }
  }

  const only = spaces.size === 1 && !askedFiles.length ? [...spaces][0] : undefined
  return { userId, fileIds: [...ids], crossOwner, ...(only ? { spaceId: only } : {}) }
}

/**
 * The passage (or file) filter for a reach: my own rows (as today), narrowed to the ids if there
 * are any; or, across owners, exactly the ids `resolveReach` allowed. `alias` is the table alias
 * whose `owner_id` and `file_id` (or `id` for files) the condition reads.
 */
export function reachSql(reach: Reach, alias = "p", idColumn = "file_id"): SQL {
  const a = sql.raw(alias)
  const col = sql.raw(idColumn)
  if (reach.crossOwner) {
    if (!reach.fileIds?.length) return sql`false`
    return sql`${a}.${col} = any(${uuidArray(reach.fileIds)}::uuid[])`
  }
  const mine = sql`${a}.owner_id = ${reach.userId}`
  if (reach.fileIds === null) return mine
  if (!reach.fileIds.length) return sql`false`
  return sql`${mine} and ${a}.${col} = any(${uuidArray(reach.fileIds)}::uuid[])`
}

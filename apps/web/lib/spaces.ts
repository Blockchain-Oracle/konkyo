import "server-only"
import { SPACES, type SpaceColor, type SpaceWall } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { eq, sql } from "drizzle-orm"
import { createFolder, renameFolder } from "./folders"
import { LibraryError, ownFolder } from "./library"

/** A space's colour when none was chosen yet: hashed from its id (same as the UI's colorFor). */
function hashedColor(id: string): SpaceColor {
  const keys = Object.keys(SPACES.colors) as SpaceColor[]
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return keys[Math.abs(hash) % keys.length] ?? "violet"
}

export type SpaceRow = {
  id: string
  name: string
  color: SpaceColor
  wall: SpaceWall
  symbol: string
  description: string | null
  sources: number
  /** The cover photo: the chosen source's page one, else the newest source with one. */
  cover: string | null
  /** The newest few polaroids, for the folder card's fanned pages. */
  thumbs: string[]
  /** The newest sources (up to five), for the folder card's fan of files. */
  recent: SpaceSource[]
  createdAt: string
}

export type SpaceSource = {
  id: string
  title: string
  kind: string
  pageCount: number | null
  hasThumb: boolean
}

const thumbUrl = (fileId: string) => `/api/files/${fileId}/thumb`

/**
 * The person's spaces (top-level folders, plan §16.6) with what the rail, Home and Library draw:
 * identity, a real cover photo and the newest polaroids, and how many sources each holds.
 */
export async function listSpaces(ownerId: string): Promise<SpaceRow[]> {
  const rows = await db.execute<{
    id: string
    name: string
    color: SpaceColor | null
    wall: SpaceWall | null
    symbol: string | null
    description: string | null
    cover_kind: string
    cover_file_id: string | null
    created_at: string
    sources: number
    newest_thumb: string | null
    recent: {
      id: string
      title: string
      kind: string
      page_count: number | null
      has_thumb: boolean
    }[]
  }>(sql`
    with filed as (
      select distinct sub.space_id, ff.file_id from file_folders ff
        join folders sub on sub.id = ff.folder_id and sub.deleted_at is null
       where sub.owner_id = ${ownerId}
    )
    select f.id, f.name, f.color, f.wall, f.symbol, f.description, f.cover_kind, f.cover_file_id,
      f.created_at::text,
      (select count(*)::int from filed
         join files x on x.id = filed.file_id and x.deleted_at is null
        where filed.space_id = f.id and x.kind <> 'note') as sources,
      (select x.id from filed
         join files x on x.id = filed.file_id and x.deleted_at is null and x.thumb_key is not null
        where filed.space_id = f.id
        order by x.created_at desc limit 1) as newest_thumb,
      (select coalesce(json_agg(t order by t.created_at desc), '[]'::json) from (
         select x.id, x.title, x.kind, x.page_count, (x.thumb_key is not null) as has_thumb,
           x.created_at
         from filed join files x on x.id = filed.file_id and x.deleted_at is null
         where filed.space_id = f.id
         order by x.created_at desc limit 5
       ) t) as recent
    from folders f
    where f.owner_id = ${ownerId} and f.parent_id is null and f.deleted_at is null
    order by f.created_at
  `)
  return rows.map((r) => {
    const color = r.color ?? hashedColor(r.id)
    const recent: SpaceSource[] = (r.recent ?? []).map((x) => ({
      id: x.id,
      title: x.title,
      kind: x.kind,
      pageCount: x.page_count,
      hasThumb: x.has_thumb,
    }))
    const thumbs = recent.filter((x) => x.hasThumb).map((x) => thumbUrl(x.id))
    return {
      id: r.id,
      name: r.name,
      color,
      wall: r.wall ?? (SPACES.defaultWall[color] as SpaceWall),
      symbol:
        r.symbol ?? SPACES.symbols[Math.abs(r.id.charCodeAt(0)) % SPACES.symbols.length] ?? "✦",
      description: r.description,
      sources: r.sources,
      cover:
        r.cover_kind === "file" && r.cover_file_id
          ? thumbUrl(r.cover_file_id)
          : r.newest_thumb
            ? thumbUrl(r.newest_thumb)
            : null,
      thumbs,
      recent,
      createdAt: r.created_at,
    }
  })
}

export type NewSpace = {
  name: string
  color: SpaceColor
  wall: SpaceWall
  symbol: string
  templateId: string
  description?: string
}

/** Makes a space: a top-level folder carrying its identity (the trigger sets its space_id). */
export async function createSpace(ownerId: string, input: NewSpace) {
  const folder = await createFolder(ownerId, input.name, null)
  await db
    .update(schema.folders)
    .set({
      color: input.color,
      wall: input.wall,
      symbol: input.symbol,
      templateId: input.templateId,
      description: input.description ?? null,
    })
    .where(eq(schema.folders.id, folder.id))
  return { id: folder.id }
}

export type SpaceEdit = Partial<
  Pick<NewSpace, "name" | "color" | "wall" | "symbol" | "description">
>

/** Changes a space's name or identity (its owner only; a space is a top-level folder). */
export async function editSpace(ownerId: string, spaceId: string, edit: SpaceEdit) {
  const folder = await ownFolder(ownerId, spaceId)
  if (folder.parentId) throw new LibraryError("Only a space has a colour and a wall", 400)
  if (edit.name != null) await renameFolder(ownerId, spaceId, edit.name)
  const identity = {
    ...(edit.color ? { color: edit.color } : {}),
    ...(edit.wall ? { wall: edit.wall } : {}),
    ...(edit.symbol ? { symbol: edit.symbol } : {}),
    ...(edit.description !== undefined ? { description: edit.description || null } : {}),
  }
  if (Object.keys(identity).length)
    await db.update(schema.folders).set(identity).where(eq(schema.folders.id, spaceId))
}

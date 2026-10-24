import "server-only"
import { SPACES, type SpaceColor, type SpaceWall } from "@konkyo/config"
import { db } from "@konkyo/db"
import { sql } from "drizzle-orm"

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
  createdAt: string
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
    thumbs: string[] | null
  }>(sql`
    select f.id, f.name, f.color, f.wall, f.symbol, f.description, f.cover_kind, f.cover_file_id,
      f.created_at::text,
      (select count(distinct ff.file_id)::int from file_folders ff
         join folders sub on sub.id = ff.folder_id and sub.deleted_at is null
         join files x on x.id = ff.file_id and x.deleted_at is null
        where sub.space_id = f.id and x.kind <> 'note') as sources,
      (select array_agg(t.id) from (
         select distinct on (x.id) x.id, x.created_at from file_folders ff
           join folders sub on sub.id = ff.folder_id and sub.deleted_at is null
           join files x on x.id = ff.file_id and x.deleted_at is null and x.thumb_key is not null
          where sub.space_id = f.id
          order by x.id, x.created_at desc
       ) t limit 5) as thumbs
    from folders f
    where f.owner_id = ${ownerId} and f.parent_id is null and f.deleted_at is null
    order by f.created_at
  `)
  return rows.map((r) => {
    const color = r.color ?? hashedColor(r.id)
    const thumbs = (r.thumbs ?? []).map(thumbUrl)
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
          : (thumbs[0] ?? null),
      thumbs,
      createdAt: r.created_at,
    }
  })
}

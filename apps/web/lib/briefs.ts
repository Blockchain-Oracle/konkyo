import "server-only"
import { randomUUID } from "node:crypto"
import { bylineOf } from "@konkyo/agents"
import type { FileMeta } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { folderRole, readableFileSql } from "@konkyo/db/access"
import { enqueue } from "@konkyo/jobs"
import { deleteObject } from "@konkyo/storage"
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { LibraryError } from "./library"
import { allowanceLeft } from "./usage"

const { briefs, folders, files } = schema

/** A brief's folder's space: its name and colours (the index's chips, the player's wall). */
const space = alias(folders, "space")
/** Only a space this person is still in: a brief made before they left keeps no window on it. */
const stillIn = (userId: string) =>
  or(
    eq(space.ownerId, userId),
    sql`exists (select 1 from space_members m where m.space_id = ${space.id} and m.user_id = ${userId})`,
  )
const spaceColumns = {
  spaceId: space.id,
  spaceName: space.name,
  spaceColor: space.color,
  spaceWall: space.wall,
}

/** Make an audio brief of a folder or some files; the worker does the rest. */
export async function startBrief(
  ownerId: string,
  input: { folderId?: string; fileIds?: string[] },
) {
  const limited = await allowanceLeft(ownerId, "audioBriefs")
  if (limited) throw new LibraryError(limited, 429)
  let title: string
  if (input.folderId) {
    // a folder of yours, or of a space you're in (the brief itself is yours)
    const folder = (await folderRole(ownerId, input.folderId))
      ? await db.query.folders.findFirst({
          where: and(eq(folders.id, input.folderId), isNull(folders.deletedAt)),
        })
      : undefined
    if (!folder) throw new LibraryError("No such folder", 404)
    title = folder.name
  } else {
    const ids = input.fileIds ?? []
    const rows = ids.length
      ? await db
          .select({ title: files.title })
          .from(files)
          .where(
            and(inArray(files.id, ids), isNull(files.deletedAt), readableFileSql(ownerId, "files")),
          )
      : []
    if (!rows.length) throw new LibraryError("Choose a folder or files for the brief", 400)
    title = rows.length === 1 ? (rows[0]?.title ?? "Your file") : `${rows.length} files`
  }
  const id = randomUUID()
  await db.insert(briefs).values({
    id,
    ownerId,
    folderId: input.folderId ?? null,
    scope: { fileIds: input.fileIds ?? [], folderIds: input.folderId ? [input.folderId] : [] },
    title,
    runId: `brief-${id}`,
  })
  await enqueue("brief", { briefId: id }, id)
  return { id }
}

async function ownBrief(ownerId: string, id: string) {
  const brief = await db.query.briefs.findFirst({
    where: and(eq(briefs.id, id), eq(briefs.ownerId, ownerId)),
  })
  if (!brief) throw new LibraryError("No such brief", 404)
  return brief
}

/** A brief for its page: the lines with their times and citations, and where its audio is. */
export async function getBrief(ownerId: string, id: string) {
  const { audioKey, ownerId: _, ...brief } = await ownBrief(ownerId, id)
  const [where] = brief.folderId
    ? await db
        .select(spaceColumns)
        .from(folders)
        .innerJoin(space, eq(space.id, folders.spaceId))
        .where(and(eq(folders.id, brief.folderId), isNull(space.deletedAt), stillIn(ownerId)))
    : []
  // Each citation shows its source's kind and byline, as an answer's chips do.
  const cited = [...new Set(brief.lines.flatMap((l) => (l.citation ? [l.citation.fileId] : [])))]
  const sources = cited.length
    ? await db
        .select({ id: files.id, kind: files.kind, meta: files.meta })
        .from(files)
        .where(and(inArray(files.id, cited), eq(files.ownerId, ownerId)))
    : []
  const about = new Map(
    sources.map((f) => [f.id, { kind: f.kind, byline: bylineOf(f.meta as FileMeta) }]),
  )
  return {
    ...brief,
    lines: brief.lines.map((l) => ({
      ...l,
      citation: l.citation
        ? {
            ...l.citation,
            kind: about.get(l.citation.fileId)?.kind ?? "pdf",
            byline: about.get(l.citation.fileId)?.byline,
          }
        : null,
    })),
    space: where?.spaceId
      ? { id: where.spaceId, name: where.spaceName, color: where.spaceColor, wall: where.spaceWall }
      : null,
    audioUrl: audioKey ? `/api/briefs/${id}/audio` : null,
    downloadUrl: audioKey ? `/api/briefs/${id}/audio?download=1` : null,
  }
}

export type Brief = Awaited<ReturnType<typeof getBrief>>

/** A person's briefs, newest first (a folder's, when given). */
export async function listBriefs(ownerId: string, folderId?: string) {
  return db
    .select({
      id: briefs.id,
      title: briefs.title,
      status: briefs.status,
      durationSeconds: briefs.durationSeconds,
      createdAt: briefs.createdAt,
      ...spaceColumns,
    })
    .from(briefs)
    .leftJoin(folders, eq(folders.id, briefs.folderId))
    .leftJoin(space, and(eq(space.id, folders.spaceId), isNull(space.deletedAt), stillIn(ownerId)))
    .where(and(eq(briefs.ownerId, ownerId), folderId ? eq(briefs.folderId, folderId) : undefined))
    .orderBy(desc(briefs.createdAt))
    .limit(50)
}

export async function deleteBrief(ownerId: string, id: string) {
  const brief = await ownBrief(ownerId, id)
  await db.delete(briefs).where(eq(briefs.id, id))
  if (brief.audioKey) await deleteObject(brief.audioKey).catch(() => undefined)
}

export async function briefAudio(ownerId: string, id: string) {
  const brief = await ownBrief(ownerId, id)
  if (!brief.audioKey) throw new LibraryError("This brief has no audio yet", 404)
  return { key: brief.audioKey, name: `${brief.title}.mp3` }
}

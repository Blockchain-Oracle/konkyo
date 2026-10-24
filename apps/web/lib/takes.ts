import "server-only"

import { db, schema } from "@konkyo/db"
import { spaceRole } from "@konkyo/db/access"
import { spaceEvent } from "@konkyo/db/live"
import { and, asc, count, eq, isNull, sql } from "drizzle-orm"
import { LibraryError } from "./library"
import { type Face, faceOf } from "./profiles"

const { spaceTakes, user, profiles, fileFolders, folders } = schema

/** A take can be this long: a thought, not an essay. */
export const TAKE_MAX = 500

export type Take = {
  id: string
  body: string
  page: number | null
  passageId: string | null
  createdAt: string
  author: { name: string; face: Face }
  mine: boolean
  canRemove: boolean
}

async function inSpace(userId: string, spaceId: string) {
  const role = await spaceRole(userId, spaceId)
  if (!role) throw new LibraryError("No such space", 404)
  return role
}

/** The source has to be filed in this space for a take on it to make sense. */
async function filedIn(spaceId: string, fileId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(fileFolders)
    .innerJoin(folders, eq(folders.id, fileFolders.folderId))
    .where(
      and(eq(fileFolders.fileId, fileId), eq(folders.spaceId, spaceId), isNull(folders.deletedAt)),
    )
  if (!row?.n) throw new LibraryError("That source isn't in this space", 404)
}

/** One source's takes, oldest first, for anyone in the space. */
export async function listTakes(
  viewerId: string,
  spaceId: string,
  fileId: string,
): Promise<Take[]> {
  const role = await inSpace(viewerId, spaceId)
  await filedIn(spaceId, fileId)
  const rows = await db
    .select({ take: spaceTakes, person: user, profile: profiles })
    .from(spaceTakes)
    .innerJoin(user, eq(user.id, spaceTakes.authorId))
    .leftJoin(profiles, eq(profiles.userId, user.id))
    .where(
      and(
        eq(spaceTakes.spaceId, spaceId),
        eq(spaceTakes.fileId, fileId),
        isNull(spaceTakes.deletedAt),
      ),
    )
    .orderBy(asc(spaceTakes.createdAt))
  return rows.map(({ take, person, profile }) => ({
    id: take.id,
    body: take.body,
    page: take.page,
    passageId: take.passageId,
    createdAt: take.createdAt.toISOString(),
    author: { name: person.name, face: faceOf(person, profile) },
    mine: take.authorId === viewerId,
    canRemove: take.authorId === viewerId || role === "owner",
  }))
}

/** How many takes each source in the space has (the wall's chips). */
export async function takeCounts(viewerId: string, spaceId: string) {
  await inSpace(viewerId, spaceId)
  const rows = await db
    .select({ fileId: spaceTakes.fileId, n: count() })
    .from(spaceTakes)
    .where(and(eq(spaceTakes.spaceId, spaceId), isNull(spaceTakes.deletedAt)))
    .groupBy(spaceTakes.fileId)
  return Object.fromEntries(rows.map((r) => [r.fileId, r.n])) as Record<string, number>
}

export async function addTake(
  viewerId: string,
  spaceId: string,
  input: { fileId: string; body: string; passageId?: string; page?: number },
) {
  await inSpace(viewerId, spaceId)
  await filedIn(spaceId, input.fileId)
  const body = input.body.trim().slice(0, TAKE_MAX)
  if (!body) throw new LibraryError("Say something first", 400)
  await db.transaction(async (tx) => {
    const [made] = await tx
      .insert(spaceTakes)
      .values({
        spaceId,
        fileId: input.fileId,
        authorId: viewerId,
        body,
        passageId: input.passageId ?? null,
        page: input.page ?? null,
      })
      .returning({ id: spaceTakes.id })
    await spaceEvent(tx, {
      spaceId,
      actorId: viewerId,
      kind: "take_added",
      subjectId: input.fileId,
      data: { takeId: made?.id },
    })
  })
  return listTakes(viewerId, spaceId, input.fileId)
}

/** Its author takes it back, or the space's owner does. */
export async function removeTake(viewerId: string, spaceId: string, takeId: string) {
  const role = await inSpace(viewerId, spaceId)
  await db.transaction(async (tx) => {
    const [gone] = await tx
      .update(spaceTakes)
      .set({ deletedAt: sql`now()` })
      .where(
        and(
          eq(spaceTakes.id, takeId),
          eq(spaceTakes.spaceId, spaceId),
          isNull(spaceTakes.deletedAt),
          role === "owner" ? undefined : eq(spaceTakes.authorId, viewerId),
        ),
      )
      .returning({ fileId: spaceTakes.fileId })
    if (!gone)
      throw new LibraryError("Only whoever wrote it, or the space's owner, can remove it", 403)
    await spaceEvent(tx, {
      spaceId,
      actorId: viewerId,
      kind: "take_removed",
      subjectId: gone.fileId,
    })
  })
}

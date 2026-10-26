import "server-only"
import { randomBytes } from "node:crypto"
import { SPACES, type SpaceColor, type SpaceWall } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { type Role, spaceRole } from "@konkyo/db/access"
import { spaceEvent } from "@konkyo/db/live"
import type { SpaceRole } from "@konkyo/db/schema"
import { and, eq, isNull, sql } from "drizzle-orm"
import { LibraryError } from "./library"
import { type Face, faceOf } from "./profiles"

const { folders, spaceInvites, spaceMembers, profiles, user } = schema

/*
 * Who's in a space. The owner is the folder's owner; everyone else is a member with a
 * role: "add" (bring sources) or "read" (read, ask, pin, take). One invite link per space at a time.
 */

export type Member = {
  userId: string
  name: string
  handle: string | null
  face: Face
  role: Role
  joinedAt: string | null
  you: boolean
}

/** Your role in a space, or a 404 when you have none (a stranger can't tell it exists). */
export async function roleIn(userId: string, spaceId: string): Promise<Role> {
  const role = await spaceRole(userId, spaceId)
  if (!role) throw new LibraryError("No such space", 404)
  return role
}

async function ownerOf(spaceId: string, userId: string) {
  const role = await roleIn(userId, spaceId)
  if (role !== "owner") throw new LibraryError("Only the space's owner can do that", 403)
}

const newToken = () => randomBytes(16).toString("base64url")

export type Invite = { token: string; path: string; role: SpaceRole }

const asInvite = (row: { token: string; role: SpaceRole }): Invite => ({
  token: row.token,
  path: `/join/${row.token}`,
  role: row.role,
})

/**
 * The space's active invite link. The owner gets one made if there's none (adders by default);
 * a member who can add may copy it; a reader can't hand it on.
 */
export async function inviteFor(userId: string, spaceId: string): Promise<Invite | null> {
  const role = await roleIn(userId, spaceId)
  if (role === "read") throw new LibraryError("Ask the owner for the invite link", 403)
  const active = await db.query.spaceInvites.findFirst({
    where: and(eq(spaceInvites.spaceId, spaceId), isNull(spaceInvites.revokedAt)),
  })
  if (active) return asInvite(active)
  if (role !== "owner") return null
  const [made] = await db
    .insert(spaceInvites)
    .values({ token: newToken(), spaceId, role: "add", createdBy: userId })
    .onConflictDoNothing()
    .returning()
  if (made) return asInvite(made)
  // made at the same moment by another tab: that one is the link
  const again = await db.query.spaceInvites.findFirst({
    where: and(eq(spaceInvites.spaceId, spaceId), isNull(spaceInvites.revokedAt)),
  })
  return again ? asInvite(again) : null
}

/** A new link (the old one stops working at once), with the role it gives. Owner only. */
export async function resetInvite(userId: string, spaceId: string, role: SpaceRole) {
  await ownerOf(spaceId, userId)
  return db.transaction(async (tx) => {
    await tx
      .update(spaceInvites)
      .set({ revokedAt: new Date() })
      .where(and(eq(spaceInvites.spaceId, spaceId), isNull(spaceInvites.revokedAt)))
    const [made] = await tx
      .insert(spaceInvites)
      .values({ token: newToken(), spaceId, role, createdBy: userId })
      .returning()
    if (!made) throw new LibraryError("Couldn't make a new link", 500)
    return asInvite(made)
  })
}

export type InvitePreview = {
  spaceId: string
  name: string
  color: string
  wall: { bg: string; ink: string }
  symbol: string
  role: SpaceRole
  owner: { name: string; face: Face }
  members: Face[]
  count: number
}

/** What the join page shows before you're in: the space, who owns it, a few faces. */
export async function invitePreview(token: string): Promise<InvitePreview> {
  const [row] = await db
    .select({ invite: spaceInvites, space: folders, owner: user, profile: profiles })
    .from(spaceInvites)
    .innerJoin(folders, eq(folders.id, spaceInvites.spaceId))
    .innerJoin(user, eq(user.id, folders.ownerId))
    .leftJoin(profiles, eq(profiles.userId, user.id))
    .where(
      and(eq(spaceInvites.token, token), isNull(spaceInvites.revokedAt), isNull(folders.deletedAt)),
    )
    .limit(1)
  if (!row) throw new LibraryError("This invite link has been turned off or reset", 404)
  const members = await db
    .select({ id: user.id, name: user.name, image: user.image, profile: profiles })
    .from(spaceMembers)
    .innerJoin(user, eq(user.id, spaceMembers.userId))
    .leftJoin(profiles, eq(profiles.userId, user.id))
    .where(eq(spaceMembers.spaceId, row.space.id))
    .limit(12)
  const color = (row.space.color ?? "violet") as SpaceColor
  const wall = SPACES.walls[(row.space.wall ?? SPACES.defaultWall[color]) as SpaceWall]
  return {
    spaceId: row.space.id,
    name: row.space.name,
    color: SPACES.colors[color].hex,
    wall,
    symbol: row.space.symbol ?? "✦",
    role: row.invite.role,
    owner: { name: row.owner.name, face: faceOf(row.owner, row.profile) },
    members: members.map((m) => faceOf(m, m.profile)),
    count: members.length + 1,
  }
}

/**
 * Join through a link. The owner just goes in; a member coming back keeps the stronger role
 * (add over read); everyone else becomes a member with the link's role.
 */
export async function joinSpace(userId: string, token: string): Promise<{ spaceId: string }> {
  const invite = await db.query.spaceInvites.findFirst({
    where: and(eq(spaceInvites.token, token), isNull(spaceInvites.revokedAt)),
  })
  if (!invite) throw new LibraryError("This invite link has been turned off or reset", 404)
  const space = await db.query.folders.findFirst({
    where: and(eq(folders.id, invite.spaceId), isNull(folders.deletedAt)),
  })
  if (!space) throw new LibraryError("That space isn't there any more", 404)
  if (space.ownerId === userId) return { spaceId: space.id }
  await db.transaction(async (tx) => {
    const already = await tx.query.spaceMembers.findFirst({
      where: and(eq(spaceMembers.spaceId, space.id), eq(spaceMembers.userId, userId)),
    })
    // someone already in keeps the role the owner gave them: a link never raises it
    if (already) return
    await tx
      .insert(spaceMembers)
      .values({ spaceId: space.id, userId, role: invite.role, invitedVia: invite.token })
      .onConflictDoNothing()
    await tx
      .update(spaceInvites)
      .set({ uses: sql`${spaceInvites.uses} + 1` })
      .where(eq(spaceInvites.token, token))
    await spaceEvent(tx, { spaceId: space.id, actorId: userId, kind: "member_joined" })
  })
  return { spaceId: space.id }
}

/** Everyone in a space, owner first: for anyone in it. */
export async function listMembers(viewerId: string, spaceId: string): Promise<Member[]> {
  await roleIn(viewerId, spaceId)
  const [owner] = await db
    .select({ id: user.id, name: user.name, image: user.image, profile: profiles })
    .from(folders)
    .innerJoin(user, eq(user.id, folders.ownerId))
    .leftJoin(profiles, eq(profiles.userId, user.id))
    .where(eq(folders.id, spaceId))
  const rest = await db
    .select({
      id: user.id,
      name: user.name,
      image: user.image,
      profile: profiles,
      role: spaceMembers.role,
      joinedAt: spaceMembers.joinedAt,
    })
    .from(spaceMembers)
    .innerJoin(user, eq(user.id, spaceMembers.userId))
    .leftJoin(profiles, eq(profiles.userId, user.id))
    .where(eq(spaceMembers.spaceId, spaceId))
    .orderBy(spaceMembers.joinedAt)
  const people: Member[] = []
  if (owner)
    people.push({
      userId: owner.id,
      name: owner.name,
      handle: owner.profile?.handle ?? null,
      face: faceOf(owner, owner.profile),
      role: "owner",
      joinedAt: null,
      you: owner.id === viewerId,
    })
  for (const m of rest)
    people.push({
      userId: m.id,
      name: m.name,
      handle: m.profile?.handle ?? null,
      face: faceOf(m, m.profile),
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
      you: m.id === viewerId,
    })
  return people
}

/** Change what a member may do. Owner only. */
export async function setMemberRole(
  ownerId: string,
  spaceId: string,
  memberId: string,
  role: SpaceRole,
) {
  await ownerOf(spaceId, ownerId)
  await db.transaction(async (tx) => {
    const [changed] = await tx
      .update(spaceMembers)
      .set({ role })
      .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, memberId)))
      .returning()
    if (!changed) throw new LibraryError("They're not in this space", 404)
    await spaceEvent(tx, {
      spaceId,
      actorId: ownerId,
      kind: "role_changed",
      subjectId: memberId,
      data: { role },
    })
  })
}

/** Unfiles a person's own files from every folder of a space (their library keeps them). */
async function unfileTheirs(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  spaceId: string,
  userId: string,
) {
  await tx.execute(sql`
    delete from file_folders ff using folders fo, files fi
    where ff.folder_id = fo.id and fo.space_id = ${spaceId}::uuid
      and ff.file_id = fi.id and fi.owner_id = ${userId}`)
}

/** Take someone out of a space; what they added leaves with them. Owner only. */
export async function removeMember(ownerId: string, spaceId: string, memberId: string) {
  await ownerOf(spaceId, ownerId)
  if (memberId === ownerId) throw new LibraryError("You own this space", 400)
  await db.transaction(async (tx) => {
    const gone = await tx
      .delete(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, memberId)))
      .returning()
    if (!gone.length) throw new LibraryError("They're not in this space", 404)
    await unfileTheirs(tx, spaceId, memberId)
    // the link they came in by would bring them straight back: it stops working, a new one is
    // made the next time the owner opens the invite popover
    await tx
      .update(spaceInvites)
      .set({ revokedAt: new Date() })
      .where(and(eq(spaceInvites.spaceId, spaceId), isNull(spaceInvites.revokedAt)))
    await spaceEvent(tx, {
      spaceId,
      actorId: ownerId,
      kind: "member_removed",
      subjectId: memberId,
    })
  })
}

/**
 * Leave a space. `take` brings your sources out with you; otherwise they stay filed there for the
 * others to keep reading (they're still yours, in your library).
 */
export async function leaveSpace(userId: string, spaceId: string, take: boolean) {
  const role = await roleIn(userId, spaceId)
  if (role === "owner") throw new LibraryError("You own this space: delete it instead", 400)
  await db.transaction(async (tx) => {
    await tx
      .delete(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)))
    if (take) await unfileTheirs(tx, spaceId, userId)
    await spaceEvent(tx, {
      spaceId,
      actorId: userId,
      kind: "member_left",
      data: { took: take },
    })
  })
}

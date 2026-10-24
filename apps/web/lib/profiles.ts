import "server-only"
import { randomBytes } from "node:crypto"
import { moderate } from "@konkyo/agents"
import { LOOKS, type LookId, PEOPLE, SPACES } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { deleteObject, objectKey, putBytes } from "@konkyo/storage"
import { and, desc, eq, sql } from "drizzle-orm"
import { LibraryError } from "./library"
import { sharePath, shareScope } from "./shares"

const { profiles, user, folderShares, folders } = schema

type Profile = typeof profiles.$inferSelect

/** What every surface needs to draw a person: their name, a picture (or none), a colour. */
export type Face = { name: string; src: string | null; color: string }

export type Me = {
  id: string
  name: string
  email: string | null
  isGuest: boolean
  handle: string | null
  bio: string | null
  lookId: LookId | null
  avatar: Profile["avatar"]
  hasPhoto: boolean
  hasGoogle: boolean
  face: Face
}

const lookOf = (id: string | null | undefined) => LOOKS.find((look) => look.id === id)

/** A steady colour from a name, for a face with no picture (OurSpaces' MemberFace). */
function colorFromName(name: string) {
  const colors = Object.values(SPACES.colors)
  let h = 0
  for (const c of name.trim().toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return colors[h % colors.length]?.hex ?? SPACES.colors.violet.hex
}

/** The photo's address carries its key's random part, so a new photo is never served stale. */
const photoUrl = (userId: string, key: string) =>
  `/api/avatars/${userId}?v=${key.split("/").at(-1)?.split(".")[0]}`

/**
 * Which face a person shows: the one they chose (a look, their photo, Google's photo), falling
 * back through the others, and last their initial on a colour.
 */
export function faceOf(
  person: { id: string; name: string; image: string | null },
  profile: Pick<Profile, "lookId" | "avatar" | "photoKey"> | null | undefined,
): Face {
  const look = lookOf(profile?.lookId)
  const color = look ? SPACES.colors[look.color].hex : colorFromName(person.name)
  const photo = profile?.photoKey ? photoUrl(person.id, profile.photoKey) : null
  const lookSrc = look ? `/looks/${look.id}.webp` : null
  const chosen =
    profile?.avatar === "photo"
      ? photo
      : profile?.avatar === "google"
        ? person.image
        : profile?.avatar === "look"
          ? lookSrc
          : null
  return { name: person.name, src: chosen ?? lookSrc ?? photo ?? person.image ?? null, color }
}

export async function getMe(userId: string): Promise<Me> {
  const [row, profile] = await Promise.all([
    db.query.user.findFirst({ where: eq(user.id, userId) }),
    db.query.profiles.findFirst({ where: eq(profiles.userId, userId) }),
  ])
  if (!row) throw new LibraryError("Sign in first", 401)
  const isGuest = Boolean(row.isAnonymous)
  const face = faceOf(row, profile)
  // What the card marks as chosen is the face actually showing (a new account shows Google's).
  const shown: Profile["avatar"] =
    profile?.photoKey && face.src === photoUrl(row.id, profile.photoKey)
      ? "photo"
      : row.image && face.src === row.image
        ? "google"
        : "look"
  return {
    id: row.id,
    name: row.name,
    email: isGuest ? null : row.email,
    isGuest,
    handle: profile?.handle ?? null,
    bio: profile?.bio ?? null,
    lookId: profile?.lookId ?? null,
    avatar: shown,
    hasPhoto: Boolean(profile?.photoKey),
    hasGoogle: Boolean(row.image) && !isGuest,
    face,
  }
}

export type ProfilePatch = {
  name?: string
  lookId?: LookId
  avatar?: Profile["avatar"]
  handle?: string | null
  bio?: string | null
}

const handleRule = new RegExp(PEOPLE.handlePattern)

/** Why a handle can't be had, or null when it's free for this person. */
export async function handleProblem(handle: string, userId: string): Promise<string | null> {
  if (!handleRule.test(handle)) return `3 to ${PEOPLE.handleMax} lowercase letters, numbers or _`
  if ((PEOPLE.reservedHandles as readonly string[]).includes(handle)) return "that one's taken"
  const owner = await db.query.profiles.findFirst({
    columns: { userId: true },
    where: eq(profiles.handle, handle),
  })
  return owner && owner.userId !== userId ? "that one's taken" : null
}

export async function updateProfile(userId: string, patch: ProfilePatch): Promise<Me> {
  const me = await getMe(userId)
  if ((patch.handle !== undefined || patch.bio !== undefined) && me.isGuest)
    throw new LibraryError("Keep your account with Google first: a page needs a kept account.", 403)
  if (patch.handle) {
    const problem = await handleProblem(patch.handle, userId)
    if (problem) throw new LibraryError(problem, 409)
  }
  if (patch.bio) {
    const check = await moderate(patch.bio)
    if (check.flagged) throw new LibraryError("That bio can't go on a public page.", 400)
  }
  if (patch.avatar === "photo" && !me.hasPhoto) throw new LibraryError("Add a photo first", 400)
  if (patch.avatar === "google" && !me.hasGoogle)
    throw new LibraryError("There's no Google photo on this account", 400)
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) throw new LibraryError("A name can't be empty", 400)
    await db.update(user).set({ name }).where(eq(user.id, userId))
  }
  const { name: _name, ...rest } = patch
  const fields = {
    ...rest,
    // Picking a look shows it; that's what the tap means.
    ...(patch.lookId && !patch.avatar ? { avatar: "look" as const } : {}),
    ...(patch.bio !== undefined ? { bio: patch.bio?.trim() || null } : {}),
  }
  if (Object.keys(fields).length > 0)
    await db
      .insert(profiles)
      .values({ userId, ...fields })
      .onConflictDoUpdate({ target: profiles.userId, set: fields })
  return getMe(userId)
}

/** JPEG, PNG or WebP by their first bytes: a photo is only ever served as one of these. */
function imageType(bytes: Uint8Array): { type: string; ext: string } | null {
  const b = bytes
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: "image/jpeg", ext: "jpg" }
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return { type: "image/png", ext: "png" }
  if (
    String.fromCharCode(...b.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...b.subarray(8, 12)) === "WEBP"
  )
    return { type: "image/webp", ext: "webp" }
  return null
}

/**
 * A photo of you (F53): the browser crops it to a 256 px square and re-encodes it (which also
 * drops its location data); the server takes only a small JPEG, PNG or WebP and shows it at once.
 */
export async function setPhoto(userId: string, bytes: Uint8Array): Promise<Me> {
  if (bytes.byteLength === 0) throw new LibraryError("That photo was empty", 400)
  if (bytes.byteLength > PEOPLE.photoMaxBytes) throw new LibraryError("That photo is too big", 413)
  const kind = imageType(bytes)
  if (!kind) throw new LibraryError("Use a JPEG, PNG or WebP photo", 415)
  const key = objectKey("avatars", userId, `${randomBytes(8).toString("hex")}.${kind.ext}`)
  await putBytes(key, bytes, kind.type)
  const before = await db.query.profiles.findFirst({ where: eq(profiles.userId, userId) })
  await db
    .insert(profiles)
    .values({ userId, photoKey: key, avatar: "photo" })
    .onConflictDoUpdate({ target: profiles.userId, set: { photoKey: key, avatar: "photo" } })
  if (before?.photoKey) await deleteObject(before.photoKey).catch(() => undefined)
  return getMe(userId)
}

export async function removePhoto(userId: string): Promise<Me> {
  const before = await db.query.profiles.findFirst({ where: eq(profiles.userId, userId) })
  if (before?.photoKey) {
    await db
      .update(profiles)
      .set({ photoKey: null, ...(before.avatar === "photo" ? { avatar: "look" as const } : {}) })
      .where(eq(profiles.userId, userId))
    await deleteObject(before.photoKey).catch(() => undefined)
  }
  return getMe(userId)
}

export async function photoKeyOf(userId: string): Promise<string | null> {
  const row = await db.query.profiles.findFirst({
    columns: { photoKey: true },
    where: eq(profiles.userId, userId),
  })
  return row?.photoKey ?? null
}

export type PublicProfile = {
  /** For "is this my page"; never shown. */
  userId: string
  handle: string
  name: string
  bio: string | null
  face: Face
  joinedAt: string
  spaces: {
    name: string
    color: string
    symbol: string | null
    href: string
    about: string | null
    sources: number
  }[]
}

/** Someone's page (/u/<handle>): only kept accounts have one; only listed links show on it. */
export async function publicProfile(handle: string): Promise<PublicProfile | null> {
  const [row] = await db
    .select({ profile: profiles, person: user })
    .from(profiles)
    .innerJoin(user, eq(user.id, profiles.userId))
    .where(and(eq(profiles.handle, handle.toLowerCase()), eq(user.isAnonymous, false)))
    .limit(1)
  if (!row) return null
  const shared = await db
    .select({
      name: folders.name,
      color: folders.color,
      symbol: folders.symbol,
      slug: folderShares.slug,
      about: folderShares.description,
    })
    .from(folderShares)
    .innerJoin(folders, eq(folders.id, folderShares.folderId))
    .where(
      and(
        eq(folderShares.ownerId, row.person.id),
        eq(folderShares.listed, true),
        sql`${folders.deletedAt} is null`,
      ),
    )
    .orderBy(desc(folderShares.createdAt))
  const counts = await Promise.all(
    shared.map((s) =>
      shareScope(s.slug)
        .then((scope) => scope.fileIds.size)
        .catch(() => 0),
    ),
  )
  return {
    userId: row.person.id,
    handle: row.profile.handle ?? handle,
    name: row.person.name,
    bio: row.profile.bio,
    face: faceOf(row.person, row.profile),
    joinedAt: row.person.createdAt.toISOString(),
    spaces: shared.map((s, i) => ({
      name: s.name,
      color: SPACES.colors[s.color ?? "violet"].hex,
      symbol: s.symbol,
      href: sharePath(s.slug),
      about: s.about,
      sources: counts[i] ?? 0,
    })),
  }
}

let hereCache: { at: number; value: { count: number; looks: LookId[] } } | null = null

/**
 * "N here right now" on the enter card: distinct people who signed in, asked, uploaded or talked
 * in the last few minutes, with the looks of up to five of them (never a name or a photo).
 */
export async function hereNow(): Promise<{ count: number; looks: LookId[] }> {
  if (hereCache && Date.now() - hereCache.at < 30_000) return hereCache.value
  const since = sql`now() - make_interval(mins => ${PEOPLE.hereWindowMinutes})`
  const rows = await db.execute<{ look_id: LookId | null }>(sql`
    select p.look_id from (
      select user_id as id from session where created_at > ${since}
      union select owner_id from messages where created_at > ${since}
      union select owner_id from runs where created_at > ${since}
      union select owner_id from files where created_at > ${since}
      union select owner_id from voice_usage where created_at > ${since}
    ) here
    left join profiles p on p.user_id = here.id`)
  const list = [...rows]
  const value = {
    count: list.length,
    looks: list.flatMap((r) => (r.look_id ? [r.look_id] : [])).slice(0, 5),
  }
  hereCache = { at: Date.now(), value }
  return value
}

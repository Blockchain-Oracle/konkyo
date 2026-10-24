import "server-only"
import { PEOPLE, SPACES } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { and, count, desc, eq, gt, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm"
import { LibraryError } from "./library"
import { type Face, faceOf } from "./profiles"
import { sharePath } from "./shares"

const { articles, follows, profiles, user, folderShares, folders } = schema

/** How the viewer stands with someone (Threads' states; mutual = friends). */
export type Relation = { you: boolean; following: boolean; followsYou: boolean; friends: boolean }

export type Person = {
  handle: string
  name: string
  bio: string | null
  face: Face
  relation: Relation
}

export type Counts = { followers: number; following: number; friends: number }

const NONE: Relation = { you: false, following: false, followsYou: false, friends: false }

export async function relationTo(viewerId: string | null, targetId: string): Promise<Relation> {
  if (!viewerId) return NONE
  if (viewerId === targetId) return { ...NONE, you: true }
  const rows = await db
    .select({ followerId: follows.followerId })
    .from(follows)
    .where(
      or(
        and(eq(follows.followerId, viewerId), eq(follows.followeeId, targetId)),
        and(eq(follows.followerId, targetId), eq(follows.followeeId, viewerId)),
      ),
    )
  const following = rows.some((r) => r.followerId === viewerId)
  const followsYou = rows.some((r) => r.followerId === targetId)
  return { you: false, following, followsYou, friends: following && followsYou }
}

export async function countsFor(userId: string): Promise<Counts> {
  const [row] = await db.execute<{ followers: number; following: number; friends: number }>(sql`
    select
      (select count(*)::int from follows where followee_id = ${userId}) as followers,
      (select count(*)::int from follows where follower_id = ${userId}) as following,
      (select count(*)::int from follows a join follows b
         on b.follower_id = a.followee_id and b.followee_id = a.follower_id
       where a.follower_id = ${userId}) as friends`)
  return {
    followers: row?.followers ?? 0,
    following: row?.following ?? 0,
    friends: row?.friends ?? 0,
  }
}

/** A kept account with a page, by handle; guests and handle-less accounts can't be followed. */
async function personByHandle(handle: string) {
  const [row] = await db
    .select({ id: user.id })
    .from(profiles)
    .innerJoin(user, eq(user.id, profiles.userId))
    .where(and(eq(profiles.handle, handle.toLowerCase()), eq(user.isAnonymous, false)))
    .limit(1)
  if (!row) throw new LibraryError("No one has that handle", 404)
  return row.id
}

async function keptViewer(viewerId: string) {
  const me = await db.query.user.findFirst({ where: eq(user.id, viewerId) })
  if (!me || me.isAnonymous)
    throw new LibraryError("Keep your account with Google first: following needs one.", 403)
}

export async function follow(viewerId: string, handle: string) {
  await keptViewer(viewerId)
  const targetId = await personByHandle(handle)
  if (targetId === viewerId) throw new LibraryError("That's you", 400)
  const [made] = await db
    .select({ n: count() })
    .from(follows)
    .where(
      and(eq(follows.followerId, viewerId), gt(follows.createdAt, sql`now() - interval '1 day'`)),
    )
  if ((made?.n ?? 0) >= PEOPLE.followsPerDay)
    throw new LibraryError("That's a lot of follows for one day. Try again tomorrow.", 429)
  await db
    .insert(follows)
    .values({ followerId: viewerId, followeeId: targetId })
    .onConflictDoNothing()
  return { relation: await relationTo(viewerId, targetId), counts: await countsFor(targetId) }
}

export async function unfollow(viewerId: string, handle: string) {
  const targetId = await personByHandle(handle)
  await db
    .delete(follows)
    .where(and(eq(follows.followerId, viewerId), eq(follows.followeeId, targetId)))
  return { relation: await relationTo(viewerId, targetId), counts: await countsFor(targetId) }
}

type Row = {
  id: string
  name: string
  image: string | null
  handle: string | null
  bio: string | null
  lookId: (typeof profiles.$inferSelect)["lookId"]
  avatar: (typeof profiles.$inferSelect)["avatar"]
  photoKey: string | null
}

const personColumns = {
  id: user.id,
  name: user.name,
  image: user.image,
  handle: profiles.handle,
  bio: profiles.bio,
  lookId: profiles.lookId,
  avatar: profiles.avatar,
  photoKey: profiles.photoKey,
}

/** Rows to people, with how the viewer stands with each (one query for all of them). */
async function asPeople(viewerId: string, rows: Row[]): Promise<Person[]> {
  const ids = rows.map((r) => r.id)
  const edges = ids.length
    ? await db
        .select({ followerId: follows.followerId, followeeId: follows.followeeId })
        .from(follows)
        .where(
          or(
            and(eq(follows.followerId, viewerId), inArray(follows.followeeId, ids)),
            and(eq(follows.followeeId, viewerId), inArray(follows.followerId, ids)),
          ),
        )
    : []
  return rows.flatMap((r) => {
    if (!r.handle) return []
    const following = edges.some((e) => e.followerId === viewerId && e.followeeId === r.id)
    const followsYou = edges.some((e) => e.followerId === r.id && e.followeeId === viewerId)
    return [
      {
        handle: r.handle,
        name: r.name,
        bio: r.bio,
        face: faceOf(r, r),
        relation: {
          you: r.id === viewerId,
          following,
          followsYou,
          friends: following && followsYou,
        },
      },
    ]
  })
}

export type PeopleTab = "friends" | "following" | "followers"

/** Your people (/people): friends (mutual), who you follow, who follows you; newest first. */
export async function listPeople(viewerId: string, tab: PeopleTab): Promise<Person[]> {
  const mine = db
    .select({ id: follows.followeeId, at: follows.createdAt })
    .from(follows)
    .where(eq(follows.followerId, viewerId))
    .as("mine")
  const theirs = db
    .select({ id: follows.followerId, at: follows.createdAt })
    .from(follows)
    .where(eq(follows.followeeId, viewerId))
    .as("theirs")
  const base = tab === "followers" ? theirs : mine
  let query = db
    .select({ ...personColumns, at: base.at })
    .from(base)
    .innerJoin(user, eq(user.id, base.id))
    .innerJoin(profiles, eq(profiles.userId, user.id))
    .$dynamic()
  if (tab === "friends") query = query.innerJoin(theirs, eq(theirs.id, mine.id))
  const rows = await query
    .where(and(eq(user.isAnonymous, false), isNotNull(profiles.handle)))
    .orderBy(desc(base.at))
    .limit(200)
  return asPeople(viewerId, rows)
}

/** People for ⌘K: kept accounts with a page, by handle or name. */
export async function searchPeople(viewerId: string, q: string): Promise<Person[]> {
  const term = q
    .trim()
    .replace(/^@/, "")
    .replace(/[%_\\]/g, (c) => `\\${c}`)
  if (term.length < 2) return []
  const rows = await db
    .select(personColumns)
    .from(profiles)
    .innerJoin(user, eq(user.id, profiles.userId))
    .where(
      and(
        eq(user.isAnonymous, false),
        isNotNull(profiles.handle),
        or(ilike(profiles.handle, `${term.toLowerCase()}%`), ilike(user.name, `%${term}%`)),
      ),
    )
    .limit(8)
  return asPeople(viewerId, rows)
}

export type FeedItem = {
  person: { handle: string; name: string; face: Face }
  verb: string
  object: { name: string; href: string; color: string; symbol: string | null }
  at: string
}

/**
 * Home's "from people you follow" (F55): what they made public lately, newest first: the
 * articles they published and the spaces they listed on their page.
 */
export async function followingFeed(viewerId: string): Promise<FeedItem[]> {
  const [spaces, published] = await Promise.all([
    followedSpaces(viewerId),
    followedArticles(viewerId),
  ])
  return [...spaces, ...published].sort((a, b) => b.at.localeCompare(a.at)).slice(0, FEED_MAX)
}

const FEED_MAX = 12

/** Articles by people the viewer follows, still published (catch me up reads these too). */
export async function followedArticles(viewerId: string, since?: Date): Promise<FeedItem[]> {
  const rows = await db
    .select({
      ...personColumns,
      title: articles.title,
      slug: articles.slug,
      at: articles.publishedAt,
    })
    .from(follows)
    .innerJoin(user, eq(user.id, follows.followeeId))
    .innerJoin(profiles, eq(profiles.userId, user.id))
    .innerJoin(articles, eq(articles.authorId, user.id))
    .where(
      and(
        eq(follows.followerId, viewerId),
        isNull(articles.unpublishedAt),
        isNotNull(profiles.handle),
        since ? gt(articles.publishedAt, since) : undefined,
      ),
    )
    .orderBy(desc(articles.publishedAt))
    .limit(FEED_MAX)
  return rows.map((r) => {
    const face = faceOf(r, r)
    return {
      person: { handle: r.handle ?? "", name: r.name, face },
      verb: "published",
      object: { name: r.title, href: `/a/${r.slug}`, color: face.color, symbol: null },
      at: r.at.toISOString(),
    }
  })
}

async function followedSpaces(viewerId: string): Promise<FeedItem[]> {
  const rows = await db
    .select({
      ...personColumns,
      space: folders.name,
      color: folders.color,
      symbol: folders.symbol,
      slug: folderShares.slug,
      at: folderShares.updatedAt,
    })
    .from(follows)
    .innerJoin(user, eq(user.id, follows.followeeId))
    .innerJoin(profiles, eq(profiles.userId, user.id))
    .innerJoin(folderShares, eq(folderShares.ownerId, user.id))
    .innerJoin(folders, eq(folders.id, folderShares.folderId))
    .where(
      and(
        eq(follows.followerId, viewerId),
        eq(folderShares.listed, true),
        isNotNull(profiles.handle),
        sql`${folders.deletedAt} is null`,
      ),
    )
    .orderBy(desc(folderShares.updatedAt))
    .limit(FEED_MAX)
  return rows.map((r) => ({
    person: { handle: r.handle ?? "", name: r.name, face: faceOf(r, r) },
    verb: "shared",
    object: {
      name: r.space,
      href: sharePath(r.slug),
      color: SPACES.colors[r.color ?? "violet"].hex,
      symbol: r.symbol,
    },
    at: r.at.toISOString(),
  }))
}

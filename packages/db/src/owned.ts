import { LOOKS } from "@konkyo/config"
import { and, eq, or, sql } from "drizzle-orm"
import type { Db } from "./index"
import {
  agentRuns,
  agents,
  apiKeys,
  articleLikes,
  articleReports,
  articles,
  briefs,
  chats,
  connections,
  files,
  folderShares,
  folders,
  follows,
  highlights,
  inboxItems,
  liveRoundAnswers,
  liveRoundPlayers,
  liveRounds,
  messages,
  noteEvents,
  notes,
  noteVersions,
  passages,
  profiles,
  pushSubscriptions,
  runs,
  spaceEvents,
  spaceInvites,
  spaceMessages,
  spacePins,
  spaceTakes,
  studyCards,
  studyDays,
  studyItems,
  studyReviews,
  studyRounds,
  studySets,
  user,
  userSettings,
} from "./schema"

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

/**
 * Every table whose rows belong to one user registers a mover here.
 * When a guest signs in with Google, Better Auth creates a new user and then deletes the
 * guest (cascading its rows), so everything the guest made must move first.
 * Each stage that adds a user-owned table adds its mover in the same commit.
 */
/** What a move leaves for the caller to clear outside Postgres (a guest photo nobody kept). */
type MoveResult = { orphans: string[] }

const movers: Array<
  (tx: Tx, fromUserId: string, toUserId: string, done: MoveResult) => Promise<unknown>
> = [
  (tx, from, to) => tx.update(folders).set({ ownerId: to }).where(eq(folders.ownerId, from)),
  (tx, from, to) => tx.update(files).set({ ownerId: to }).where(eq(files.ownerId, from)),
  (tx, from, to) =>
    tx.update(connections).set({ ownerId: to }).where(eq(connections.ownerId, from)),
  (tx, from, to) => tx.update(apiKeys).set({ ownerId: to }).where(eq(apiKeys.ownerId, from)),
  (tx, from, to) =>
    tx.update(folderShares).set({ ownerId: to }).where(eq(folderShares.ownerId, from)),
  (tx, from, to) => tx.update(passages).set({ ownerId: to }).where(eq(passages.ownerId, from)),
  (tx, from, to) => tx.update(highlights).set({ ownerId: to }).where(eq(highlights.ownerId, from)),
  (tx, from, to) => tx.update(chats).set({ ownerId: to }).where(eq(chats.ownerId, from)),
  (tx, from, to) => tx.update(messages).set({ ownerId: to }).where(eq(messages.ownerId, from)),
  (tx, from, to) => tx.update(runs).set({ ownerId: to }).where(eq(runs.ownerId, from)),
  (tx, from, to) => tx.update(notes).set({ ownerId: to }).where(eq(notes.ownerId, from)),
  (tx, from, to) =>
    tx.update(noteVersions).set({ ownerId: to }).where(eq(noteVersions.ownerId, from)),
  (tx, from, to) => tx.update(noteEvents).set({ ownerId: to }).where(eq(noteEvents.ownerId, from)),
  (tx, from, to) => tx.update(agents).set({ ownerId: to }).where(eq(agents.ownerId, from)),
  (tx, from, to) => tx.update(briefs).set({ ownerId: to }).where(eq(briefs.ownerId, from)),
  (tx, from, to) => tx.update(agentRuns).set({ ownerId: to }).where(eq(agentRuns.ownerId, from)),
  (tx, from, to) => tx.update(inboxItems).set({ ownerId: to }).where(eq(inboxItems.ownerId, from)),
  (tx, from, to) =>
    tx.update(pushSubscriptions).set({ ownerId: to }).where(eq(pushSubscriptions.ownerId, from)),
  (tx, from, to) => tx.update(studySets).set({ ownerId: to }).where(eq(studySets.ownerId, from)),
  (tx, from, to) => tx.update(spacePins).set({ ownerId: to }).where(eq(spacePins.ownerId, from)),
  (tx, from, to) =>
    tx.update(spaceEvents).set({ actorId: to }).where(eq(spaceEvents.actorId, from)),
  (tx, from, to) => tx.update(studyItems).set({ ownerId: to }).where(eq(studyItems.ownerId, from)),
  (tx, from, to) => tx.update(studyCards).set({ ownerId: to }).where(eq(studyCards.ownerId, from)),
  (tx, from, to) =>
    tx.update(studyReviews).set({ ownerId: to }).where(eq(studyReviews.ownerId, from)),
  (tx, from, to) =>
    tx.update(studyRounds).set({ ownerId: to }).where(eq(studyRounds.ownerId, from)),
  // Streak days: the account's own days win where both studied on the same day.
  async (tx, from, to) => {
    const theirs = await tx
      .select({ day: studyDays.day })
      .from(studyDays)
      .where(eq(studyDays.ownerId, to))
    const taken = new Set(theirs.map((d) => d.day))
    const mine = await tx.select().from(studyDays).where(eq(studyDays.ownerId, from))
    for (const d of mine)
      if (!taken.has(d.day)) await tx.insert(studyDays).values({ ...d, ownerId: to })
    await tx.delete(studyDays).where(eq(studyDays.ownerId, from))
  },
  // Who you are (F53). The account linked during "keep this" is newer than the guest: it takes the
  // guest's look and photo, and the name they typed (a look's placeholder name or Better Auth's
  // "Anonymous" gives way to Google's). An account that existed before keeps its name and the face
  // it shows; it only gains a look or photo it didn't have. A guest photo nobody keeps is dropped.
  async (tx, from, to, done) => {
    const mine = await tx.query.profiles.findFirst({ where: eq(profiles.userId, from) })
    if (!mine) return
    const [guest, account, theirs] = await Promise.all([
      tx.query.user.findFirst({ where: eq(user.id, from) }),
      tx.query.user.findFirst({ where: eq(user.id, to) }),
      tx.query.profiles.findFirst({ where: eq(profiles.userId, to) }),
    ])
    const fresh = Boolean(guest && account && account.createdAt >= guest.createdAt)
    const adoptPhoto = Boolean(mine.photoKey) && !theirs?.photoKey
    const avatar =
      fresh || (!theirs?.lookId && !theirs?.photoKey && !account?.image)
        ? mine.avatar
        : (theirs?.avatar ?? (account?.image ? ("google" as const) : mine.avatar))
    await tx
      .insert(profiles)
      .values({
        userId: to,
        lookId: theirs?.lookId ?? mine.lookId,
        bio: theirs?.bio ?? mine.bio,
        photoKey: theirs?.photoKey ?? mine.photoKey,
        avatar,
        handle: theirs?.handle ?? null,
      })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: {
          lookId: sql`coalesce(${profiles.lookId}, ${mine.lookId})`,
          bio: sql`coalesce(${profiles.bio}, ${mine.bio})`,
          photoKey: sql`coalesce(${profiles.photoKey}, ${mine.photoKey})`,
        },
      })
    await tx.delete(profiles).where(eq(profiles.userId, from))
    if (mine.photoKey && !adoptPhoto) done.orphans.push(mine.photoKey)
    if (fresh) {
      const typed = guest?.name.trim() ?? ""
      const placeholder =
        typed === "" || typed === "Anonymous" || LOOKS.some((look) => look.name === typed)
      if (!placeholder) await tx.update(user).set({ name: typed }).where(eq(user.id, to))
    }
  },
  // Spaces you joined (F56): they come with you, at the stronger role where the account was
  // already a member (add over read); a membership of a space the account owns is dropped.
  async (tx, from, to) => {
    await tx.execute(sql`
      insert into space_members (space_id, user_id, role, invited_via, joined_at)
      select m.space_id, ${to}, m.role, m.invited_via, m.joined_at from space_members m
      join folders f on f.id = m.space_id
      where m.user_id = ${from} and f.owner_id <> ${to}
      on conflict (space_id, user_id) do update set role = case
        when space_members.role = 'add' or excluded.role = 'add' then 'add' else 'read' end`)
    await tx.execute(sql`delete from space_members where user_id = ${from}`)
  },
  (tx, from, to) =>
    tx.update(spaceInvites).set({ createdBy: to }).where(eq(spaceInvites.createdBy, from)),
  (tx, from, to) =>
    tx.update(spaceTakes).set({ authorId: to }).where(eq(spaceTakes.authorId, from)),
  (tx, from, to) =>
    tx.update(spaceMessages).set({ authorId: to }).where(eq(spaceMessages.authorId, from)),
  (tx, from, to) =>
    tx.update(spaceMessages).set({ askerId: to }).where(eq(spaceMessages.askerId, from)),
  // Articles (F57) need a kept account, so a guest has none; likes and reports move defensively.
  (tx, from, to) => tx.update(articles).set({ authorId: to }).where(eq(articles.authorId, from)),
  async (tx, from, to) => {
    await tx.execute(sql`
      insert into article_likes (article_id, user_id, created_at)
      select article_id, ${to}, created_at from article_likes where user_id = ${from}
      on conflict do nothing`)
    await tx.delete(articleLikes).where(eq(articleLikes.userId, from))
  },
  (tx, from, to) =>
    tx.update(articleReports).set({ reporterId: to }).where(eq(articleReports.reporterId, from)),
  // Follows (F55): guests can't follow or be followed, so this is defensive: whatever is there
  // moves, never as a follow of yourself.
  async (tx, from, to) => {
    await tx.execute(sql`
      insert into follows (follower_id, followee_id, created_at)
      select ${to}, followee_id, created_at from follows
      where follower_id = ${from} and followee_id <> ${to}
      on conflict do nothing`)
    await tx.execute(sql`
      insert into follows (follower_id, followee_id, created_at)
      select follower_id, ${to}, created_at from follows
      where followee_id = ${from} and follower_id <> ${to}
      on conflict do nothing`)
    await tx.delete(follows).where(or(eq(follows.followerId, from), eq(follows.followeeId, from)))
  },
  // Live rounds (F58): guests host and play them; a round both accounts played keeps one seat and
  // the first answer to each question.
  (tx, from, to) => tx.update(liveRounds).set({ hostId: to }).where(eq(liveRounds.hostId, from)),
  async (tx, from, to) => {
    await tx.execute(sql`
      insert into live_round_players (round_id, user_id, joined_at)
      select round_id, ${to}, joined_at from live_round_players where user_id = ${from}
      on conflict do nothing`)
    await tx.delete(liveRoundPlayers).where(eq(liveRoundPlayers.userId, from))
    await tx.execute(sql`
      insert into live_round_answers (round_id, at, user_id, choice, "right", ms, created_at)
      select round_id, at, ${to}, choice, "right", ms, created_at from live_round_answers
      where user_id = ${from}
      on conflict do nothing`)
    await tx.delete(liveRoundAnswers).where(eq(liveRoundAnswers.userId, from))
  },
  // The account signed into keeps its own settings if it has them.
  async (tx, from, to) => {
    const existing = await tx.query.userSettings.findFirst({ where: eq(userSettings.userId, to) })
    if (!existing)
      await tx.update(userSettings).set({ userId: to }).where(eq(userSettings.userId, from))
  },
]

/**
 * Moves everything a guest made to the account they signed in with, then removes the guest.
 * Better Auth 1.7.8 skips its own guest cleanup when the Google account is brand new (the guest row survived a first-time sign-up), so the guest is deleted here too.
 * Only rows still flagged as guests are deleted; sessions cascade with the user.
 */
export async function reownUserData(
  db: Db,
  fromUserId: string,
  toUserId: string,
): Promise<MoveResult> {
  const done: MoveResult = { orphans: [] }
  if (fromUserId === toUserId) return done
  await db.transaction(async (tx) => {
    for (const move of movers) await move(tx, fromUserId, toUserId, done)
    await tx.delete(user).where(and(eq(user.id, fromUserId), eq(user.isAnonymous, true)))
  })
  return done
}

/** What deleting a person leaves outside Postgres: stored bytes, Zetaris evidence, watch tables. */
export async function ownedOutsidePostgres(db: Db, userId: string) {
  const [owned, watches, spoken, connected, profile, written] = await Promise.all([
    db
      .select({ id: files.id, originalKey: files.originalKey, renditionKey: files.renditionKey })
      .from(files)
      .where(eq(files.ownerId, userId)),
    db.select({ table: agents.zetarisTable }).from(agents).where(eq(agents.ownerId, userId)),
    db.select({ key: briefs.audioKey }).from(briefs).where(eq(briefs.ownerId, userId)),
    db
      .select({ accountId: connections.accountId })
      .from(connections)
      .where(eq(connections.ownerId, userId)),
    db.query.profiles.findFirst({ where: eq(profiles.userId, userId) }),
    db.select({ id: articles.id }).from(articles).where(eq(articles.authorId, userId)),
  ])
  return {
    fileIds: owned.map((f) => f.id),
    keys: [
      ...owned.flatMap((f) => [f.originalKey, f.renditionKey]),
      ...spoken.map((b) => b.key),
      profile?.photoKey,
    ].filter((k): k is string => !!k),
    tables: watches.map((w) => w.table).filter((t): t is string => !!t),
    /** Composio connected accounts, revoked so nothing keeps access to the person's mail. */
    accounts: connected.map((c) => c.accountId),
    /** Their articles: the covers and page images stored for each go with them. */
    articleIds: written.map((a) => a.id),
  }
}

/**
 * Deletes a person and every row they own (each user-owned table cascades from `user`), and
 * returns what the worker must still remove outside Postgres, with their memory files.
 */
export async function deleteUserRows(db: Db, userId: string) {
  const outside = await ownedOutsidePostgres(db, userId)
  await db.delete(user).where(eq(user.id, userId))
  return { ...outside, ownerId: userId }
}

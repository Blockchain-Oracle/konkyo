import { and, eq } from "drizzle-orm"
import type { Db } from "./index"
import {
  agentRuns,
  agents,
  briefs,
  chats,
  connections,
  files,
  folderShares,
  folders,
  highlights,
  inboxItems,
  messages,
  noteEvents,
  notes,
  noteVersions,
  passages,
  pushSubscriptions,
  runs,
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
const movers: Array<(tx: Tx, fromUserId: string, toUserId: string) => Promise<unknown>> = [
  (tx, from, to) => tx.update(folders).set({ ownerId: to }).where(eq(folders.ownerId, from)),
  (tx, from, to) => tx.update(files).set({ ownerId: to }).where(eq(files.ownerId, from)),
  (tx, from, to) =>
    tx.update(connections).set({ ownerId: to }).where(eq(connections.ownerId, from)),
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
export async function reownUserData(db: Db, fromUserId: string, toUserId: string): Promise<void> {
  if (fromUserId === toUserId) return
  await db.transaction(async (tx) => {
    for (const move of movers) await move(tx, fromUserId, toUserId)
    await tx.delete(user).where(and(eq(user.id, fromUserId), eq(user.isAnonymous, true)))
  })
}

/** What deleting a person leaves outside Postgres: stored bytes, Zetaris evidence, watch tables. */
export async function ownedOutsidePostgres(db: Db, userId: string) {
  const [owned, watches, spoken, connected] = await Promise.all([
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
  ])
  return {
    fileIds: owned.map((f) => f.id),
    keys: [
      ...owned.flatMap((f) => [f.originalKey, f.renditionKey]),
      ...spoken.map((b) => b.key),
    ].filter((k): k is string => !!k),
    tables: watches.map((w) => w.table).filter((t): t is string => !!t),
    /** Composio connected accounts, revoked so nothing keeps access to the person's mail. */
    accounts: connected.map((c) => c.accountId),
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

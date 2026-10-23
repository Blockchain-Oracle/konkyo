import "server-only"
import { db, schema } from "@konkyo/db"
import { pushTo } from "@konkyo/notify"
import { and, count, desc, eq, isNull } from "drizzle-orm"
import { LibraryError } from "./library"

const { inboxItems, pushSubscriptions } = schema

export async function listInbox(ownerId: string) {
  const rows = await db
    .select()
    .from(inboxItems)
    .where(and(eq(inboxItems.ownerId, ownerId), isNull(inboxItems.dismissedAt)))
    .orderBy(desc(inboxItems.createdAt))
    .limit(200)
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    href: r.href,
    data: r.data,
    read: Boolean(r.readAt),
    createdAt: r.createdAt.toISOString(),
  }))
}

export type InboxItem = Awaited<ReturnType<typeof listInbox>>[number]

export async function unreadCount(ownerId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(inboxItems)
    .where(
      and(
        eq(inboxItems.ownerId, ownerId),
        isNull(inboxItems.readAt),
        isNull(inboxItems.dismissedAt),
      ),
    )
  return row?.n ?? 0
}

export async function updateItem(
  ownerId: string,
  id: string,
  patch: { read?: boolean; dismissed?: boolean },
) {
  const now = new Date()
  const [row] = await db
    .update(inboxItems)
    .set({
      ...(patch.read != null ? { readAt: patch.read ? now : null } : {}),
      ...(patch.dismissed != null ? { dismissedAt: patch.dismissed ? now : null } : {}),
    })
    .where(and(eq(inboxItems.id, id), eq(inboxItems.ownerId, ownerId)))
    .returning({ id: inboxItems.id })
  if (!row) throw new LibraryError("No such item", 404)
}

export async function markAllRead(ownerId: string) {
  await db
    .update(inboxItems)
    .set({ readAt: new Date() })
    .where(and(eq(inboxItems.ownerId, ownerId), isNull(inboxItems.readAt)))
}

/** A device that turned notifications on; the same endpoint moves to whoever signs in on it. */
export async function subscribe(
  ownerId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent: string | null,
) {
  await db
    .insert(pushSubscriptions)
    .values({
      endpoint: sub.endpoint,
      ownerId,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: userAgent?.slice(0, 300),
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { ownerId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    })
}

export async function unsubscribe(ownerId: string, endpoint: string) {
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.ownerId, ownerId)))
}

export async function testPush(ownerId: string) {
  return pushTo(ownerId, {
    title: "Notifications are on",
    body: "Review reminders and finished agent runs will reach you here.",
    href: "/inbox",
    tag: "test",
  })
}

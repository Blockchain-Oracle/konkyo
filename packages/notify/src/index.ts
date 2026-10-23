import { db, schema } from "@konkyo/db"
import type { InboxData, InboxKind } from "@konkyo/db/schema"
import { env } from "@konkyo/env/server"
import { eq } from "drizzle-orm"
import webpush from "web-push"

const { inboxItems, pushSubscriptions } = schema

let ready: boolean | undefined
function vapid() {
  if (ready !== undefined) return ready
  ready = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)
  if (ready)
    webpush.setVapidDetails(
      env.VAPID_SUBJECT,
      env.VAPID_PUBLIC_KEY as string,
      env.VAPID_PRIVATE_KEY as string,
    )
  return ready
}

/** The public half of the VAPID pair, for the browser's subscribe call. */
export const vapidPublicKey = () => env.VAPID_PUBLIC_KEY ?? null

export type PushPayload = {
  title: string
  body?: string
  /** Where tapping the notification goes. */
  href?: string
  /** A later notification with the same tag replaces this one (one reminder a day, not a pile). */
  tag?: string
}

/**
 * Web Push to every device the person turned notifications on for. A subscription the push
 * service says is gone (404, 410) is removed; other failures are left for the next notice.
 */
export async function pushTo(ownerId: string, payload: PushPayload) {
  if (!vapid()) return { sent: 0 }
  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.ownerId, ownerId))
  let sent = 0
  await Promise.all(
    subscriptions.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 12 * 60 * 60, urgency: "normal" },
        )
        sent++
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode
        if (status === 404 || status === 410)
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, s.endpoint))
        else console.warn(`[push] ${status ?? ""} ${(error as Error).message}`)
      }
    }),
  )
  return { sent }
}

export type Notice = {
  kind: InboxKind
  title: string
  body?: string
  href?: string
  data?: InboxData
  /** Also as a Web Push notification (default yes). */
  push?: boolean
  tag?: string
}

/** Into the Inbox (F41), and to the person's devices. */
export async function notify(ownerId: string, notice: Notice) {
  const [item] = await db
    .insert(inboxItems)
    .values({
      ownerId,
      kind: notice.kind,
      title: notice.title,
      body: notice.body,
      href: notice.href,
      data: notice.data ?? {},
    })
    .returning({ id: inboxItems.id })
  if (notice.push !== false)
    await pushTo(ownerId, {
      title: notice.title,
      body: notice.body,
      href: notice.href ?? "/inbox",
      tag: notice.tag,
    })
  return { id: item?.id }
}

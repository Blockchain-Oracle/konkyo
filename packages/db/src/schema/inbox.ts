import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { owner } from "./library"

/**
 * What lands in the Inbox (plan F41): review reminders, sources a watch found, finished agent
 * runs, practice an agent made, and mail to a space that waits for its owner.
 */
export type InboxKind =
  | "review"
  | "new-source"
  | "agent-run"
  | "practice"
  | "brief"
  | "system"
  /** Mail to a space from someone who isn't in it, waiting for the owner's yes (F59). */
  | "held-mail"

export type InboxData = {
  /** new-source: what Import brings in (a DOI, or a page's address). */
  doi?: string
  url?: string
  /** The agent and run it came from. */
  agentId?: string
  runId?: string
  /** practice: the set to open. */
  setId?: string
  /** "Author et al. · 2021 · Journal" for a found source. */
  detail?: string
  /** Set once it's been imported (Import becomes Open). */
  fileId?: string
  /** held-mail: the email and the space it was sent to. */
  inboundId?: string
  spaceId?: string
}

export const inboxItems = pgTable(
  "inbox_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: owner(),
    kind: text().$type<InboxKind>().notNull(),
    title: text().notNull(),
    body: text(),
    /** Where Open goes. */
    href: text(),
    data: jsonb().$type<InboxData>().default({}).notNull(),
    readAt: timestamp({ withTimezone: true }),
    dismissedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("inbox_items_owner_idx").on(t.ownerId, t.createdAt)],
)

/** One browser or phone that turned notifications on (Web Push). */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    endpoint: text().primaryKey(),
    ownerId: owner(),
    p256dh: text().notNull(),
    auth: text().notNull(),
    userAgent: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("push_subscriptions_owner_idx").on(t.ownerId)],
)

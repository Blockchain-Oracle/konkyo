import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { owner } from "./library"

/**
 * What lands in the Inbox (plan F41): review reminders, sources a watch found, finished agent
 * runs, and practice an agent made.
 */
export type InboxKind = "review" | "new-source" | "agent-run" | "practice" | "brief" | "system"

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

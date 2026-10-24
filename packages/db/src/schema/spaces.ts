import { sql } from "drizzle-orm"
import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { user } from "./auth"
import { chats } from "./chat"
import { files, folders, owner } from "./library"

/** What happened in a space: the live stream replays these (S19) and catch me up reads them. */
export type SpaceEventKind =
  | "source_added"
  | "source_ready"
  | "source_failed"
  | "source_removed"
  | "pin_added"
  | "pin_removed"
  | "take_added"
  | "take_removed"
  | "message_added"
  | "message_updated"
  | "message_removed"
  | "member_joined"
  | "member_left"
  | "member_removed"
  | "role_changed"
  | "space_updated"
  | "space_trashed"
  | "space_restored"
  | "round_started"
  | "round_ended"
  | "brief_ready"

/**
 * The durable activity log of a space (plan §16.9): written with a NOTIFY in the same transaction,
 * replayed by Last-Event-ID, pruned after 30 days. Rows carry ids only, never content.
 */
export const spaceEvents = pgTable(
  "space_events",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    spaceId: uuid()
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
    actorId: text().references(() => user.id, { onDelete: "set null" }),
    kind: text().$type<SpaceEventKind>().notNull(),
    subjectId: text(),
    data: jsonb().$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("space_events_space_id_idx").on(t.spaceId, t.id),
    index("space_events_space_time_idx").on(t.spaceId, t.createdAt),
  ],
)

/** One citation of a pinned answer, frozen with its quote (the passage can be opened from it). */
export type PinCitation = {
  n: number
  fileId: string
  passageId: string
  title: string
  kind: string
  page: number | null
  tStart: number | null
  quote: string
}

/**
 * An answer pinned to a space's wall (plan F52, OurSpaces' "promote"): a frozen snapshot of the
 * question, the verified answer and its citations, so the wall never changes under it. Once per
 * answer per space; the pinner or the space's owner can unpin.
 */
export const spacePins = pgTable(
  "space_pins",
  {
    id: uuid().defaultRandom().primaryKey(),
    spaceId: uuid()
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
    /** Who pinned it. */
    ownerId: owner(),
    messageId: text().notNull(),
    chatId: uuid().references(() => chats.id, { onDelete: "set null" }),
    question: text().notNull(),
    /** The verified answer with its [n] markers. */
    body: text().notNull(),
    citations: jsonb().$type<PinCitation[]>().notNull(),
    /** Quotes the receipt checked. */
    quotes: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("space_pins_space_message_idx").on(t.spaceId, t.messageId),
    index("space_pins_space_time_idx").on(t.spaceId, t.createdAt),
  ],
)

/** What a member of someone else's space may do (plan F56): add sources, or only read and ask. */
export type SpaceRole = "add" | "read"

/**
 * The people in a space besides its owner (the owner is `folders.owner_id`, never a row here).
 * Members read everything in the space, ask, pin and take; with "add" they file their own sources
 * into it. Their files stay theirs: leaving unfiles them, nobody else can delete them.
 */
export const spaceMembers = pgTable(
  "space_members",
  {
    spaceId: uuid()
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text().$type<SpaceRole>().notNull(),
    /** The invite token they came in by (null when added another way). */
    invitedVia: text(),
    joinedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.spaceId, t.userId] }),
    index("space_members_user_idx").on(t.userId),
  ],
)

/**
 * A space's invite link: one active at a time (reset = revoke this one and make another). The
 * token is 16 random bytes; it gives the role it was made with.
 */
export const spaceInvites = pgTable(
  "space_invites",
  {
    token: text().primaryKey(),
    spaceId: uuid()
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
    role: text().$type<SpaceRole>().notNull(),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    uses: integer().default(0).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (t) => [uniqueIndex("space_invites_active_idx").on(t.spaceId).where(sql`${t.revokedAt} is null`)],
)

/**
 * Takes (plan F56): a short thread per source in a shared space ("your take…"), each pinned to the
 * passage or page it's about when there is one. The author edits or removes theirs; the space's
 * owner removes anything.
 */
export const spaceTakes = pgTable(
  "space_takes",
  {
    id: uuid().defaultRandom().primaryKey(),
    spaceId: uuid()
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
    fileId: uuid()
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    authorId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text().notNull(),
    passageId: uuid(),
    page: integer(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    editedAt: timestamp({ withTimezone: true }),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("space_takes_file_idx").on(t.spaceId, t.fileId, t.createdAt)],
)

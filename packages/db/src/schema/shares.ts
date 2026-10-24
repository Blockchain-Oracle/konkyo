import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { folders, owner } from "./library"

/**
 * A public folder (plan F36): a read-only link anyone can open, read and ask. Unpublishing
 * deletes the row, so its link stops working; publishing again makes a new link.
 */
export const folderShares = pgTable("folder_shares", {
  folderId: uuid()
    .primaryKey()
    .references(() => folders.id, { onDelete: "cascade" }),
  ownerId: owner(),
  /** The link's random part: unguessable, and it says nothing about the folder or its owner. */
  slug: text().notNull().unique(),
  description: text(),
  /** Off by default: visitors read files in the viewer, without a download button. */
  allowDownloads: boolean().default(false).notNull(),
  /** Shown under "public spaces" on the owner's page (/u/<handle>); a link stays unlisted until then. */
  listed: boolean().default(false).notNull(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

/** Each answer given to a visitor, for the per-visitor and per-folder caps. */
export const shareAnswers = pgTable(
  "share_answers",
  {
    id: uuid().defaultRandom().primaryKey(),
    folderId: uuid()
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
    /** A keyed hash of the visitor's address, never the address itself. */
    visitor: text().notNull(),
    /** Quotes the answer's receipt checked (the landing's live counter counts these too). */
    quotes: integer().default(0).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("share_answers_folder_idx").on(t.folderId, t.createdAt),
    index("share_answers_visitor_idx").on(t.visitor, t.createdAt),
  ],
)

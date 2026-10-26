import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { files, owner } from "./library"

/**
 * A note's content. A note is a file of kind "note", so it lives in folders, the
 * library table, Trash and search like any file; this row holds what the editor writes.
 */
export const notes = pgTable("notes", {
  fileId: uuid()
    .primaryKey()
    .references(() => files.id, { onDelete: "cascade" }),
  ownerId: owner(),
  /** The Tiptap document (ProseMirror JSON), with citation nodes inline. */
  content: jsonb().notNull(),
  /** Plain text, for chat (passages) and search. */
  text: text().default("").notNull(),
  words: integer().default(0).notNull(),
  updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  /** When the text was last read into passages for chat. */
  indexedAt: timestamp({ withTimezone: true }),
})

/** Version history (F24): autosaves grouped every few minutes, and named versions. */
export const noteVersions = pgTable(
  "note_versions",
  {
    id: uuid().primaryKey().defaultRandom(),
    fileId: uuid()
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    ownerId: owner(),
    content: jsonb().notNull(),
    words: integer().default(0).notNull(),
    /** Set when the person named it; autosaved versions have none. */
    name: text(),
    auto: boolean().default(true).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("note_versions_file_idx").on(t.fileId, t.createdAt)],
)

/**
 * The process record (F25): every AI action on the draft (checks, suggested citations, what was
 * inserted), in order, exportable with the version history as an appendix.
 */
export const noteEvents = pgTable(
  "note_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    fileId: uuid()
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    ownerId: owner(),
    type: text().notNull(),
    data: jsonb().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("note_events_file_idx").on(t.fileId, t.createdAt)],
)

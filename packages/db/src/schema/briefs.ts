import { index, jsonb, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { folders, owner } from "./library"

export type BriefScope = { fileIds: string[]; folderIds: string[] }

/** One spoken line, with the passage it cites (if it states a fact) and when it's heard. */
export type BriefLineRow = {
  speaker: "A" | "B"
  text: string
  citation: {
    fileId: string
    passageId: string
    title: string
    page: number | null
    tStart: number | null
    quote: string
  } | null
  start: number
  end: number
}

/** An audio brief (plan F37): two voices talking through a folder, every fact cited. */
export const briefs = pgTable(
  "briefs",
  {
    id: uuid().defaultRandom().primaryKey(),
    ownerId: owner(),
    /** The folder it's about, when it's a folder's (null for a set of files). */
    folderId: uuid().references(() => folders.id, { onDelete: "set null" }),
    scope: jsonb().$type<BriefScope>().notNull(),
    title: text().notNull(),
    status: text().$type<"making" | "ready" | "failed">().default("making").notNull(),
    problem: text(),
    lines: jsonb().$type<BriefLineRow[]>().default([]).notNull(),
    audioKey: text(),
    durationSeconds: real(),
    /** Its trace in `logs/`. */
    runId: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("briefs_owner_idx").on(t.ownerId, t.createdAt)],
)

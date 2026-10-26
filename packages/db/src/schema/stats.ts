import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core"

/**
 * The landing's running totals (spaces made, sources read, quotes checked): the highest each has
 * reached, so a deleted guest account never makes Konkyo look as if it did less.
 */
export const siteTotals = pgTable("site_totals", {
  key: text().primaryKey(),
  value: integer().notNull(),
  updatedAt: timestamp({ withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

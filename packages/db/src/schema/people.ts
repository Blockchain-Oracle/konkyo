import type { LookId } from "@konkyo/config"
import { sql } from "drizzle-orm"
import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { user } from "./auth"

/**
 * Who a person is to everyone else (plan F53, F54). The display name stays `user.name` and a
 * Google photo stays `user.image`; this row holds the rest: the look they picked, a photo they
 * uploaded, and for a kept account a handle and a bio (their page at /u/<handle>).
 * `avatar` says which face shows: a look, their photo, or the photo Google gave.
 */
export const profiles = pgTable(
  "profiles",
  {
    userId: text()
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Lowercase `[a-z0-9_]{3,24}`; null for guests (a handle needs a kept account). */
    handle: text(),
    bio: text(),
    lookId: text().$type<LookId>(),
    avatar: text().$type<"look" | "photo" | "google">().default("look").notNull(),
    /** avatars/<userId>/<random>.<ext>, a 256 px square cropped in the browser. */
    photoKey: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("profiles_handle_idx").on(t.handle).where(sql`${t.handle} is not null`)],
)

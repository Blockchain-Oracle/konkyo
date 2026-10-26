import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { owner } from "./library"

/**
 * API keys: what scripts calling the HTTP entry point sign in with. The key
 * is shown once when made; only its SHA-256 is kept, with a few characters to recognise it by.
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid().defaultRandom().primaryKey(),
    ownerId: owner(),
    name: text().notNull(),
    /** The key's first characters ("kk_3f9a2c"), shown in Settings. */
    prefix: text().notNull(),
    hash: text().notNull().unique(),
    lastUsedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("api_keys_owner_idx").on(t.ownerId)],
)

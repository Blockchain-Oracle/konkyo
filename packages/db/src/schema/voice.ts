import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { user } from "./auth"

/**
 * What talking to Konkyo used (plan S16, F38): a voice session started (`listen`, in sessions;
 * each is one Scribe token of up to 15 minutes) and characters read aloud (`speak`, only what
 * ElevenLabs actually made: a cached clip costs nothing and is not counted). Settings → Usage and
 * the daily caps sum these over 24 hours.
 */
export const voiceUsage = pgTable(
  "voice_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"listen" | "speak">().notNull(),
    amount: integer("amount").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("voice_usage_owner_time_idx").on(t.ownerId, t.createdAt)],
)

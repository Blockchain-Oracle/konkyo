import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { user } from "./auth"
import { folders } from "./library"

/**
 * What became of one email sent to a space's address (plan F59): received, its sources added,
 * held for the space's owner (a sender who isn't in the space, or whose domain didn't vouch for
 * it), discarded, or sent to an address no space has. One row per Resend email, so a webhook
 * delivered twice is handled once.
 */
export type InboundStatus = "received" | "imported" | "held" | "discarded" | "unknown" | "failed"

export const inboundEmails = pgTable(
  "inbound_emails",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Resend's id for the received email: the key every retry carries. */
    emailId: text().notNull().unique(),
    spaceId: uuid().references(() => folders.id, { onDelete: "set null" }),
    /** The sender's bare address, lowercased. */
    from: text().notNull(),
    subject: text().default("").notNull(),
    status: text().$type<InboundStatus>().default("received").notNull(),
    /** Why it was held, failed or went nowhere, in plain words. */
    reason: text(),
    /** The sources it became. */
    fileIds: jsonb().$type<string[]>().default([]).notNull(),
    /** Who said yes or no to a held email. */
    decidedBy: text().references(() => user.id, { onDelete: "set null" }),
    decidedAt: timestamp({ withTimezone: true }),
    receivedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("inbound_emails_space_idx").on(t.spaceId, t.receivedAt)],
)

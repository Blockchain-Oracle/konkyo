import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { owner, timestamps } from "./library"

/** What a chat looks at (plan F10): empty means the whole library. */
export type ChatScope = { fileIds?: string[]; folderIds?: string[] }

export const chats = pgTable(
  "chats",
  {
    id: uuid().primaryKey(),
    ownerId: owner(),
    title: text().notNull(),
    scope: jsonb().$type<ChatScope>().default({}).notNull(),
    pinnedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("chats_owner_updated_idx").on(t.ownerId, t.updatedAt)],
)

/** One message, stored as the AI SDK UI parts it streamed as (text, steps, citations, receipt). */
export const messages = pgTable(
  "messages",
  {
    id: text().primaryKey(),
    chatId: uuid()
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    ownerId: owner(),
    role: text().$type<"user" | "assistant">().notNull(),
    parts: jsonb().$type<unknown[]>().notNull(),
    runId: uuid(),
    /** 👍/👎 on an answer (plan F17); a 👎 carries the person's reason. */
    feedback: text().$type<"up" | "down">(),
    feedbackNote: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("messages_chat_idx").on(t.chatId, t.createdAt)],
)

/** One agent run: its outcome, receipt and every trace event (also in logs/<runId>.jsonl). */
export const runs = pgTable(
  "runs",
  {
    id: uuid().primaryKey(),
    chatId: uuid()
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    ownerId: owner(),
    question: text().notNull(),
    status: text().$type<"running" | "answered" | "not-found" | "failed" | "stopped">().notNull(),
    receipt: jsonb(),
    events: jsonb().$type<unknown[]>(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("runs_chat_idx").on(t.chatId, t.createdAt)],
)

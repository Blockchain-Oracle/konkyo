import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { user } from "./auth"
import { owner, timestamps } from "./library"

/** What a chat looks at: empty means the whole library. */
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
    /** 👍/👎 on an answer; a 👎 carries the person's reason. */
    feedback: text().$type<"up" | "down">(),
    feedbackNote: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("messages_chat_idx").on(t.chatId, t.createdAt)],
)

export type RunStatus =
  | "running"
  | "queued"
  | "searching"
  | "awaiting"
  | "importing"
  | "answering"
  | "answered"
  | "not-found"
  | "failed"
  | "stopped"

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
    /** "answer" runs in the chat request; "deep" (deep search, F18) runs in the worker. */
    kind: text().$type<"answer" | "deep">().default("answer").notNull(),
    status: text().$type<RunStatus>().notNull(),
    /** The assistant message the run fills (deep search writes its answer there when done). */
    messageId: text(),
    /** A deep run's working state: candidates, the person's choice, the folder it imports into. */
    state: jsonb(),
    receipt: jsonb(),
    events: jsonb().$type<unknown[]>(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("runs_chat_idx").on(t.chatId, t.createdAt)],
)

/**
 * A deep run's progress, one row per event. The run view replays them from any point
 * (SSE Last-Event-ID), so a reload or a second tab picks up where it is.
 */
export const runEvents = pgTable(
  "run_events",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    runId: uuid()
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    type: text().notNull(),
    data: jsonb().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  // The id orders every event (the worker and the web app both write them) and is the SSE id.
  (t) => [index("run_events_run_idx").on(t.runId, t.id)],
)

/** Choices a person makes once (Settings). */
export const userSettings = pgTable("user_settings", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Deep search imports what it finds without asking first (F18). */
  autoImportSources: boolean().default(false).notNull(),
  /** The citation style exports start with (F26); each export can pick another. CSL id. */
  citationStyle: text().default("apa").notNull(),
  /** Study sounds: on by default, and only ever in Study. */
  studySound: boolean().default(true).notNull(),
  /** New items a day's review brings in, beside the ones already due (F29). */
  dailyNew: integer().default(15).notNull(),
  /** Streak freezes held (F31): two at most, one back every seven studied days. */
  streakFreezes: integer().default(2).notNull(),
  /** The person's time zone, so a streak day is their day. */
  timeZone: text(),
  /** Review reminders (F29): on by default, at this hour of the person's day. */
  reviewReminders: boolean().default(true).notNull(),
  reminderHour: integer().default(18).notNull(),
  /** When the person chose a starter or skipped it (F39); first-run Home shows it until then. */
  onboardedAt: timestamp({ withTimezone: true }),
  /** Catch me up (F50) reads what moved after this: the last time the person closed it. */
  catchupFrom: timestamp({ withTimezone: true }),
  /** Taps, places and checks; the browser keeps a copy so a page plays it at once. */
  interfaceSounds: boolean().default(true).notNull(),
  /** After a spoken ask Konkyo says the short answer out loud; off = it only shows it. */
  readAloud: boolean().default(true).notNull(),
  /** The ElevenLabs voice Konkyo answers in (one of VOICE.voices); null = the default. */
  voiceId: text(),
  /** The weekly digest by email (F59): off unless asked for; Fridays at reminderHour. */
  weeklyDigest: boolean().default(false).notNull(),
  /** The ISO week of the last digest sent, so a restart never sends one twice. */
  digestWeek: text(),
  updatedAt: timestamp({ withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
})

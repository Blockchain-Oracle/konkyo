import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { user } from "./auth"
import { folders } from "./library"
import { studySets } from "./study"

export type RoundPhase = "lobby" | "question" | "reveal" | "done"

/** The passage a question was checked against, frozen with the round (players may not own it). */
export type RoundGround = {
  title: string
  byline: string | null
  page: number | null
  tStart: number | null
  quote: string
  /** The passage around the quote (≤600 characters). */
  context: string
}

/**
 * One question, frozen when the round starts: every question is multiple choice so answers can be
 * counted into bars. True/false and compare have their two options; find-the-evidence offers
 * passages; recall offers the right answer among other answers from the same practice set.
 */
export type RoundQuestion = {
  itemId: string
  kind: "truefalse" | "compare" | "evidence" | "recall"
  prompt: string
  options: { id: string; label: string }[]
  answer: string
  ground: RoundGround
}

/**
 * A live round: a lobby with a join code, then one question at a time. Every phase
 * change is `update … where version = $v`, so two players moving it at once move it once.
 */
export const liveRounds = pgTable(
  "live_rounds",
  {
    id: uuid().defaultRandom().primaryKey(),
    code: text().notNull().unique(),
    hostId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** The space it was started from (its colour and its members' way in), if any. */
    spaceId: uuid().references(() => folders.id, { onDelete: "set null" }),
    setId: uuid().references(() => studySets.id, { onDelete: "set null" }),
    title: text().notNull(),
    questions: jsonb().$type<RoundQuestion[]>().notNull(),
    phase: text().$type<RoundPhase>().default("lobby").notNull(),
    /** The question on screen (0-based). */
    at: integer().default(0).notNull(),
    version: integer().default(0).notNull(),
    seconds: integer().notNull(),
    /** When the current question's soft timer runs out. */
    endsAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp({ withTimezone: true }),
    endedAt: timestamp({ withTimezone: true }),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("live_rounds_host_idx").on(t.hostId, t.createdAt)],
)

export const liveRoundPlayers = pgTable(
  "live_round_players",
  {
    roundId: uuid()
      .notNull()
      .references(() => liveRounds.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    joinedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.roundId, t.userId] }),
    index("live_round_players_user_idx").on(t.userId),
  ],
)

export const liveRoundAnswers = pgTable(
  "live_round_answers",
  {
    roundId: uuid()
      .notNull()
      .references(() => liveRounds.id, { onDelete: "cascade" }),
    at: integer().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    choice: text().notNull(),
    right: boolean().notNull(),
    ms: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.roundId, t.at, t.userId] })],
)

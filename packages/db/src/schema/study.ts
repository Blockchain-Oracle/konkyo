import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { files, owner } from "./library"

export type StudySetStatus = "generating" | "ready" | "failed"
export type StudyScope = { fileIds: string[]; folderIds: string[] }

/** A practice set (plan F27): items made from some files or folders, in one run. */
export const studySets = pgTable(
  "study_sets",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: owner(),
    title: text().notNull(),
    scope: jsonb().$type<StudyScope>().notNull(),
    status: text().$type<StudySetStatus>().default("generating").notNull(),
    /** Passages read for it, items that passed every check, items the checks refused. */
    passages: integer().default(0).notNull(),
    made: integer().default(0).notNull(),
    dropped: integer().default(0).notNull(),
    problem: text(),
    /** Its trace file in `logs/`. */
    runId: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("study_sets_owner_idx").on(t.ownerId, t.createdAt)],
)

/**
 * What an item's practice looks like:
 * - recall: a question with a short answer;
 * - cloze: a sentence from the source with a blank;
 * - truefalse: one statement, true or subtly false (then rewritten);
 * - order: steps of a real sequence;
 * - compare: two sources on one point, agree or disagree.
 * "Find the evidence" is built from the others' claims when a round starts.
 */
export type StudyKind = "recall" | "cloze" | "truefalse" | "order" | "compare"
export type StudyItemStatus = "active" | "removed" | "wrong"

/** Where an item's answer is in the library: enough to cite it and open it. */
export type StudyGround = {
  fileId: string
  passageId: string
  page: number | null
  tStart: number | null
  /** Words copied exactly from the passage that show the answer. */
  quote: string
}

export type StudyItemData = {
  /** truefalse: the passage's own sentence the statement was made from. */
  original?: string
  isTrue?: boolean
  /** order: the steps, in their real order. */
  steps?: string[]
  /** compare: the second source, and how the two relate on the point. */
  other?: StudyGround
  relation?: "agree" | "disagree"
  /**
   * Find the Evidence: three similar library passages the Verifier confirmed don't state the
   * item's claim, chosen when the item was made. Items without them aren't asked that way.
   */
  distractors?: string[]
}

export type StudyCheck = {
  /** The quote is in the passage (code), in Zetaris's reading of the source, and the Verifier's call. */
  code: boolean
  zetaris: boolean
  verifier: string
  model?: string
  /** Changed by the person; re-checked unless they kept it unchecked. */
  edited?: boolean
  unchecked?: boolean
}

/** One practice item (F27), tied to the passage its answer key was checked against. */
export const studyItems = pgTable(
  "study_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: owner(),
    setId: uuid()
      .notNull()
      .references(() => studySets.id, { onDelete: "cascade" }),
    fileId: uuid()
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    /** No foreign key: re-reading a file replaces its passages under the same ids. */
    passageId: text().notNull(),
    page: integer(),
    tStart: real(),
    kind: text().$type<StudyKind>().notNull(),
    topic: text().notNull(),
    prompt: text().notNull(),
    answer: text().notNull(),
    accepted: jsonb().$type<string[]>().default([]).notNull(),
    /** Two hints, the second narrower than the first; then the answer. */
    hints: jsonb().$type<string[]>().default([]).notNull(),
    quote: text().notNull(),
    /** "Why?": a short explanation with [1] citing the passage. */
    why: text().notNull(),
    /** The passage's point in one sentence (Find the evidence). */
    claim: text().notNull(),
    data: jsonb().$type<StudyItemData>().default({}).notNull(),
    check: jsonb().$type<StudyCheck>().notNull(),
    status: text().$type<StudyItemStatus>().default("active").notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("study_items_set_idx").on(t.setId),
    index("study_items_owner_idx").on(t.ownerId, t.status),
  ],
)

/** FSRS state per item (F29); due cards make the daily review. */
export const studyCards = pgTable(
  "study_cards",
  {
    itemId: uuid()
      .primaryKey()
      .references(() => studyItems.id, { onDelete: "cascade" }),
    ownerId: owner(),
    due: timestamp({ withTimezone: true }).notNull(),
    stability: real().notNull(),
    difficulty: real().notNull(),
    scheduledDays: integer().notNull(),
    learningSteps: integer().notNull(),
    reps: integer().notNull(),
    lapses: integer().notNull(),
    state: integer().notNull(),
    lastReview: timestamp({ withTimezone: true }),
  },
  (t) => [index("study_cards_due_idx").on(t.ownerId, t.due)],
)

/** Every answer: how it went, the grade FSRS got, and where (review or which game). */
export const studyReviews = pgTable(
  "study_reviews",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: owner(),
    itemId: uuid()
      .notNull()
      .references(() => studyItems.id, { onDelete: "cascade" }),
    roundId: uuid(),
    outcome: text().$type<"right" | "helped" | "shown">().notNull(),
    grade: integer().notNull(),
    hints: integer().default(0).notNull(),
    tries: integer().default(1).notNull(),
    answer: text(),
    ms: integer(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("study_reviews_item_idx").on(t.itemId, t.createdAt)],
)

export type StudyMode = "quiz" | "review" | "recall" | "fix" | "evidence" | "order" | "compare"

/** A finished round (a review set or a game round): its score, and its local day. */
export const studyRounds = pgTable(
  "study_rounds",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: owner(),
    mode: text().$type<StudyMode>().notNull(),
    setId: uuid().references(() => studySets.id, { onDelete: "set null" }),
    day: date({ mode: "string" }).notNull(),
    items: integer().notNull(),
    right: integer().notNull(),
    helped: integer().notNull(),
    shown: integer().notNull(),
    /** Counted toward the streak: at least one answer recalled, not just revealed (F31). */
    counted: boolean().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("study_rounds_day_idx").on(t.ownerId, t.day)],
)

/** Streak days (F31): studied, covered by a freeze, or won back by a repair. */
export const studyDays = pgTable(
  "study_days",
  {
    ownerId: owner(),
    day: date({ mode: "string" }).notNull(),
    kind: text().$type<"done" | "freeze" | "repair">().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.day] })],
)

import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { owner } from "./library"

/**
 * An agent (plan F34): a saved standing task. "watch" looks for new open-access papers on a
 * topic (an OpenAlex REST table in Zetaris); "quiz" makes practice from a folder on a schedule.
 */
export type AgentKind = "watch" | "quiz"
export type AgentSchedule = { every: "day" | "week"; weekday?: number; hour: number }
export type AgentScope = { fileIds: string[]; folderIds: string[] }

export const agents = pgTable(
  "agents",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: owner(),
    name: text().notNull(),
    kind: text().$type<AgentKind>().notNull(),
    /** watch: the topic searched for; quiz: an optional note. */
    instructions: text().default("").notNull(),
    scope: jsonb().$type<AgentScope>().default({ fileIds: [], folderIds: [] }).notNull(),
    schedule: jsonb().$type<AgentSchedule>().notNull(),
    status: text().$type<"active" | "paused">().default("active").notNull(),
    /** The watch's REST table in Zetaris (null when the instance wouldn't create one). */
    zetarisTable: text(),
    nextRunAt: timestamp({ withTimezone: true }),
    lastRunAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("agents_owner_idx").on(t.ownerId),
    index("agents_due_idx").on(t.status, t.nextRunAt),
  ],
)

/** One run of an agent: what it found or made, and how (Zetaris, or OpenAlex directly). */
export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid().primaryKey().defaultRandom(),
    agentId: uuid()
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    ownerId: owner(),
    status: text().$type<"running" | "done" | "failed">().default("running").notNull(),
    trigger: text().$type<"schedule" | "manual">().notNull(),
    found: integer().default(0).notNull(),
    summary: text(),
    via: text(),
    /** The trace file in `logs/`. */
    traceId: text(),
    startedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("agent_runs_agent_idx").on(t.agentId, t.startedAt)],
)

/** Papers a watch has already told the person about, so each is announced once. */
export const agentSeen = pgTable(
  "agent_seen",
  {
    agentId: uuid()
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    doi: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.agentId, t.doi] })],
)

import "server-only"
import { db, schema } from "@konkyo/db"
import type { AgentKind, AgentSchedule, AgentScope } from "@konkyo/db/schema"
import { enqueue } from "@konkyo/jobs"
import { describeSchedule, nextRunAt } from "@konkyo/jobs/schedule"
import { dropWatchTable } from "@konkyo/zetaris"
import { and, desc, eq, inArray } from "drizzle-orm"
import { LibraryError } from "./library"

const { agents, agentRuns, userSettings } = schema

export type AgentInput = {
  name: string
  kind: AgentKind
  instructions: string
  scope: AgentScope
  schedule: AgentSchedule
}

async function timeZoneOf(ownerId: string) {
  const row = await db.query.userSettings.findFirst({ where: eq(userSettings.userId, ownerId) })
  return row?.timeZone ?? "UTC"
}

function validate(input: AgentInput) {
  if (!input.name.trim()) throw new LibraryError("Give the agent a name", 400)
  if (input.kind === "watch" && input.instructions.trim().length < 3)
    throw new LibraryError("Say what to watch for", 400)
  if (input.kind === "quiz" && !input.scope.fileIds.length && !input.scope.folderIds.length)
    throw new LibraryError("Choose a folder or files to quiz you on", 400)
}

export async function listAgents(ownerId: string) {
  const rows = await db
    .select()
    .from(agents)
    .where(eq(agents.ownerId, ownerId))
    .orderBy(desc(agents.createdAt))
  const runs = rows.length
    ? await db
        .select()
        .from(agentRuns)
        .where(
          inArray(
            agentRuns.agentId,
            rows.map((r) => r.id),
          ),
        )
        .orderBy(desc(agentRuns.startedAt))
        .limit(200)
    : []
  return rows.map((a) => ({
    id: a.id,
    name: a.name,
    kind: a.kind,
    instructions: a.instructions,
    scope: a.scope,
    schedule: a.schedule,
    scheduleText: describeSchedule(a.schedule),
    status: a.status,
    nextRunAt: a.status === "active" ? (a.nextRunAt?.toISOString() ?? null) : null,
    lastRunAt: a.lastRunAt?.toISOString() ?? null,
    zetaris: Boolean(a.zetarisTable),
    runs: runs
      .filter((r) => r.agentId === a.id)
      .slice(0, 10)
      .map((r) => ({
        id: r.id,
        status: r.status,
        trigger: r.trigger,
        found: r.found,
        summary: r.summary,
        via: r.via,
        startedAt: r.startedAt.toISOString(),
        endedAt: r.endedAt?.toISOString() ?? null,
      })),
  }))
}

export type AgentView = Awaited<ReturnType<typeof listAgents>>[number]

/** A new agent (F34); its first run starts straight away, so it shows it works. */
export async function createAgent(ownerId: string, input: AgentInput) {
  validate(input)
  const tz = await timeZoneOf(ownerId)
  const [row] = await db
    .insert(agents)
    .values({
      ownerId,
      name: input.name.trim().slice(0, 120),
      kind: input.kind,
      instructions: input.instructions.trim().slice(0, 300),
      scope: input.scope,
      schedule: input.schedule,
      nextRunAt: nextRunAt(input.schedule, tz),
    })
    .returning({ id: agents.id })
  if (!row) throw new LibraryError("Couldn't create the agent", 500)
  await enqueue("agent", { agentId: row.id, trigger: "manual" }, `agent:${row.id}`)
  return { id: row.id }
}

async function ownAgent(ownerId: string, id: string) {
  const row = await db.query.agents.findFirst({
    where: and(eq(agents.id, id), eq(agents.ownerId, ownerId)),
  })
  if (!row) throw new LibraryError("No such agent", 404)
  return row
}

export async function updateAgent(
  ownerId: string,
  id: string,
  patch: Partial<AgentInput> & { status?: "active" | "paused" },
) {
  const agent = await ownAgent(ownerId, id)
  const next = { ...agent, ...patch }
  validate({ ...next, scope: next.scope, schedule: next.schedule })
  const tz = await timeZoneOf(ownerId)
  // A new topic needs a new REST table: the old one is dropped and the next run makes it.
  const topicChanged =
    patch.instructions != null && patch.instructions.trim() !== agent.instructions
  if (topicChanged && agent.zetarisTable) await dropWatchTable(agent.zetarisTable)
  await db
    .update(agents)
    .set({
      name: next.name.trim().slice(0, 120),
      instructions: next.instructions.trim().slice(0, 300),
      scope: next.scope,
      schedule: next.schedule,
      status: next.status,
      ...(topicChanged ? { zetarisTable: null } : {}),
      nextRunAt: next.status === "active" ? nextRunAt(next.schedule, tz) : null,
    })
    .where(eq(agents.id, id))
  if (topicChanged) await db.delete(schema.agentSeen).where(eq(schema.agentSeen.agentId, id))
}

export async function runNow(ownerId: string, id: string) {
  await ownAgent(ownerId, id)
  await enqueue("agent", { agentId: id, trigger: "manual" }, `agent:${id}`)
}

export async function deleteAgent(ownerId: string, id: string) {
  const agent = await ownAgent(ownerId, id)
  if (agent.zetarisTable) await dropWatchTable(agent.zetarisTable)
  await db.delete(agents).where(eq(agents.id, id))
}

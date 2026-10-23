import { Tracer } from "@konkyo/agents"
import { INGEST } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { env } from "@konkyo/env/server"
import { enqueue } from "@konkyo/jobs"
import { describeSchedule, nextRunAt } from "@konkyo/jobs/schedule"
import { notify, pushTo } from "@konkyo/notify"
import {
  createWatchTable,
  newWorks,
  refreshWatch,
  sqlHash,
  type WatchedWork,
  watchEndpoint,
} from "@konkyo/zetaris"
import { and, eq, lte, sql } from "drizzle-orm"
import { makeSet } from "./study"

const { agents, agentRuns, agentSeen, studySets, userSettings } = schema

type Agent = typeof agents.$inferSelect

/** "Diekelmann et al. · 2026 · Nature Reviews Neuroscience" for a found paper. */
const detailOf = (w: WatchedWork) =>
  [
    w.firstAuthor ? `${w.firstAuthor.split(" ").at(-1)}${w.authors > 1 ? " et al." : ""}` : null,
    w.publicationDate.slice(0, 4) || null,
    w.venue,
  ]
    .filter(Boolean)
    .join(" · ")

/** DOIs the person already has (from their files' citation records) or was already told about. */
async function knownDois(agent: Agent) {
  const rows = await db.execute<{ doi: string }>(sql`
    select lower(f.meta #>> '{csl,DOI}') as doi from files f
    where f.owner_id = ${agent.ownerId} and f.deleted_at is null and f.meta #>> '{csl,DOI}' is not null
    union
    select doi from agent_seen where agent_id = ${agent.id}
  `)
  return rows.map((r) => r.doi).filter(Boolean)
}

/** The same search straight from OpenAlex, when the Zetaris instance won't hold a REST table. */
async function directWorks(topic: string, known: Set<string>): Promise<WatchedWork[]> {
  const key = env.OPENALEX_API_KEY
  const res = await fetch(watchEndpoint(topic), {
    headers: { "user-agent": INGEST.userAgent, ...(key ? { authorization: `Bearer ${key}` } : {}) },
    signal: AbortSignal.timeout(INGEST.metadataTimeoutMs),
  })
  if (!res.ok) throw new Error(`OpenAlex answered ${res.status}`)
  const today = new Date().toISOString().slice(0, 10)
  const body = (await res.json()) as {
    results: {
      id: string
      doi: string | null
      display_name: string | null
      publication_date: string | null
      authorships?: { author?: { display_name?: string } }[]
      primary_location?: { source?: { display_name?: string } | null } | null
    }[]
  }
  return body.results
    .map((r) => ({
      openalexId: r.id.replace("https://openalex.org/", ""),
      doi: (r.doi ?? "").replace(/^https?:\/\/doi\.org\//i, "").toLowerCase(),
      title: r.display_name ?? "Untitled",
      publicationDate: r.publication_date ?? "",
      firstAuthor: r.authorships?.[0]?.author?.display_name ?? null,
      authors: r.authorships?.length ?? 0,
      venue: r.primary_location?.source?.display_name ?? null,
    }))
    .filter((w) => w.doi && w.publicationDate <= today && !known.has(w.doi))
}

/** Announced per run at most; the rest are kept as seen (a watch never floods the Inbox). */
const PER_RUN = 5

async function runWatch(agent: Agent, tracer: Tracer) {
  const known = await knownDois(agent)
  const [seenBefore] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(agentSeen)
    .where(eq(agentSeen.agentId, agent.id))
  const firstRun = !seenBefore?.n
  let found: WatchedWork[]
  let via = "zetaris"
  try {
    let table = agent.zetarisTable
    if (!table) {
      table = await createWatchTable(agent.id, agent.instructions)
      await db.update(agents).set({ zetarisTable: table }).where(eq(agents.id, agent.id))
    }
    await refreshWatch(table)
    const result = await newWorks(table, known)
    found = result.works
    tracer.log({
      agent: "scout",
      step: "watch",
      action: "queried_zetaris",
      sqlHash: sqlHash(result.sql),
      rowsReturned: result.rows,
      latencyMs: result.ms,
      detail: { table, known: known.length },
    })
  } catch (error) {
    via = "openalex"
    tracer.log({
      agent: "scout",
      step: "watch",
      action: "zetaris_unavailable",
      detail: { reason: (error as Error).message.slice(0, 300) },
    })
    found = await directWorks(agent.instructions, new Set(known))
  }
  if (found.length)
    await db
      .insert(agentSeen)
      .values(found.map((w) => ({ agentId: agent.id, doi: w.doi })))
      .onConflictDoNothing()
  // The first run starts the watch: the newest few now, everything else counts as seen.
  const announce = found.slice(0, firstRun ? 3 : PER_RUN)
  for (const w of announce)
    await notify(agent.ownerId, {
      kind: "new-source",
      title: w.title,
      href: `https://doi.org/${w.doi}`,
      data: { doi: w.doi, agentId: agent.id, detail: detailOf(w) || undefined },
      push: false,
    })
  const topic = `“${agent.instructions}”`
  const summary = firstRun
    ? `Watching ${topic}. ${found.length} recent open-access papers; the newest ${announce.length} are in your Inbox, and new ones will follow.`
    : found.length
      ? `${found.length} new open-access ${found.length === 1 ? "paper" : "papers"} on ${topic}.`
      : `Nothing new on ${topic} since the last check.`
  if (announce.length)
    await pushTo(agent.ownerId, {
      title: agent.name,
      body: summary,
      href: "/inbox",
      tag: `agent-${agent.id}`,
    })
  return { found: found.length, summary, via }
}

async function runQuiz(agent: Agent, tracer: Tracer) {
  const id = crypto.randomUUID()
  const title = `${agent.name} · ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
  await db.insert(studySets).values({
    id,
    ownerId: agent.ownerId,
    title,
    scope: agent.scope,
    runId: `study-${id}`,
  })
  tracer.log({ agent: "tutor", step: "quiz", action: "making_set", detail: { setId: id } })
  await makeSet(id)
  const set = await db.query.studySets.findFirst({ where: eq(studySets.id, id) })
  if (set?.status === "ready" && set.made) {
    await notify(agent.ownerId, {
      kind: "practice",
      title: `Your quiz is ready: ${agent.name}`,
      body: `${set.made} items, every answer checked against its passage.`,
      href: `/study/session?mode=quiz&set=${id}`,
      data: { setId: id, agentId: agent.id },
      tag: `agent-${agent.id}`,
    })
    return { found: set.made, summary: `Made ${set.made} practice items.`, via: "tutor" }
  }
  throw new Error(set?.problem ?? "No practice could be made this time.")
}

/** One run (F34): its record, its trace, the Inbox, and when it runs next. */
export async function runAgent(agentId: string, trigger: "schedule" | "manual") {
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) })
  if (!agent || (trigger === "schedule" && agent.status !== "active")) return
  const [run] = await db
    .insert(agentRuns)
    .values({ agentId, ownerId: agent.ownerId, trigger })
    .returning({ id: agentRuns.id })
  if (!run) return
  const tracer = new Tracer(`agent-${run.id}`)
  try {
    const result =
      agent.kind === "watch" ? await runWatch(agent, tracer) : await runQuiz(agent, tracer)
    await db
      .update(agentRuns)
      .set({
        status: "done",
        found: result.found,
        summary: result.summary,
        via: result.via,
        traceId: tracer.runId,
        endedAt: new Date(),
      })
      .where(eq(agentRuns.id, run.id))
  } catch (error) {
    const message = (error as Error).message
    await db
      .update(agentRuns)
      .set({
        status: "failed",
        summary: message.slice(0, 500),
        traceId: tracer.runId,
        endedAt: new Date(),
      })
      .where(eq(agentRuns.id, run.id))
    await notify(agent.ownerId, {
      kind: "agent-run",
      title: `${agent.name} couldn't run`,
      body: message.slice(0, 300),
      href: "/agents",
      push: false,
    })
  } finally {
    const settings = await db.query.userSettings.findFirst({
      where: eq(userSettings.userId, agent.ownerId),
    })
    await db
      .update(agents)
      .set({
        lastRunAt: new Date(),
        nextRunAt: nextRunAt(agent.schedule, settings?.timeZone ?? "UTC"),
      })
      .where(eq(agents.id, agentId))
    await tracer.flush()
  }
}

/**
 * Every five minutes: agents whose time has come are queued once each (their next run is set
 * first, so the next tick doesn't queue them again).
 */
export async function queueDueAgents() {
  const due = await db
    .select({ id: agents.id, ownerId: agents.ownerId, schedule: agents.schedule })
    .from(agents)
    .where(and(eq(agents.status, "active"), lte(agents.nextRunAt, new Date())))
  for (const a of due) {
    const settings = await db.query.userSettings.findFirst({
      where: eq(userSettings.userId, a.ownerId),
    })
    await db
      .update(agents)
      .set({ nextRunAt: nextRunAt(a.schedule, settings?.timeZone ?? "UTC") })
      .where(eq(agents.id, a.id))
    await enqueue("agent", { agentId: a.id, trigger: "schedule" }, `agent:${a.id}`)
  }
  return { queued: due.length, described: due.map((a) => describeSchedule(a.schedule)) }
}

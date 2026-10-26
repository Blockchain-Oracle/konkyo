import { randomUUID } from "node:crypto"
import { placeFinding, Tracer } from "@konkyo/agents"
import { BRIEF, INGEST } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { resolveReach } from "@konkyo/db/access"
import { env } from "@konkyo/env/server"
import { fixMojibake, workAbstracts } from "@konkyo/ingest"
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
import { and, desc, eq, isNull, lte, sql } from "drizzle-orm"
import { makeBrief } from "./brief"
import { makeSet } from "./study"

const { agents, agentRuns, agentSeen, briefs, folders, inboxItems, studySets, user, userSettings } =
  schema

/** What a run reports: `notified` when it already put something in the Inbox. */
type RunResult = { found: number; summary: string; via: string; notified: boolean }

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

async function runWatch(agent: Agent, tracer: Tracer): Promise<RunResult> {
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
  // a few OpenAlex records carry double-encoded names and titles (whichever way they came)
  found = found.map((w) => ({
    ...w,
    title: fixMojibake(w.title),
    firstAuthor: w.firstAuthor && fixMojibake(w.firstAuthor),
    venue: w.venue && fixMojibake(w.venue),
  }))
  if (found.length)
    await db
      .insert(agentSeen)
      .values(found.map((w) => ({ agentId: agent.id, doi: w.doi })))
      .onConflictDoNothing()
  // The first run starts the watch: the newest few now, everything else counts as seen.
  const announce = found.slice(0, firstRun ? 3 : PER_RUN)
  // Each finding says where it stands against what the person has: agrees, disagrees, or new.
  const abstracts = await workAbstracts(announce.map((w) => w.openalexId)).catch(
    () => new Map<string, string>(),
  )
  const stances = await Promise.all(
    announce.map((w) => {
      const abstract = abstracts.get(w.openalexId)
      return abstract
        ? placeFinding(agent.ownerId, agent.scope, { title: w.title, abstract }, tracer).catch(
            () => null,
          )
        : null
    }),
  )
  for (const [i, w] of announce.entries())
    await notify(agent.ownerId, {
      kind: "new-source",
      title: w.title,
      href: `https://doi.org/${w.doi}`,
      data: {
        doi: w.doi,
        agentId: agent.id,
        detail: detailOf(w) || undefined,
        stance: stances[i] ?? undefined,
      },
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
  return { found: found.length, summary, via, notified: announce.length > 0 }
}

async function runQuiz(agent: Agent, tracer: Tracer): Promise<RunResult> {
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
    return {
      found: set.made,
      summary: `Made ${set.made} practice items.`,
      via: "tutor",
      notified: true,
    }
  }
  throw new Error(set?.problem ?? "No practice could be made this time.")
}

/**
 * A brief agent's run: a new two-voice brief of its space, made only when sources were added
 * since the last one (an unchanged space would give the same talk) and within the person's daily
 * allowance of briefs. The finished brief reaches the Inbox from makeBrief, with Listen.
 */
async function runBrief(agent: Agent, tracer: Tracer): Promise<RunResult> {
  const reach = await resolveReach(agent.ownerId, agent.scope)
  const ids = reach.fileIds ?? []
  const folderId = agent.scope.folderIds.length === 1 ? agent.scope.folderIds[0] : undefined
  const folder = folderId
    ? await db.query.folders.findFirst({
        where: and(eq(folders.id, folderId), isNull(folders.deletedAt)),
      })
    : undefined
  if (folderId && !folder) throw new Error("Its space is gone.")
  const about = folder?.name ?? agent.name
  const quiet = (summary: string) => ({ found: 0, summary, via: "brief", notified: false })

  const last = await db.query.briefs.findFirst({
    where: and(
      eq(briefs.ownerId, agent.ownerId),
      eq(briefs.status, "ready"),
      sql`${briefs.scope} = ${JSON.stringify(agent.scope)}::jsonb`,
    ),
    orderBy: desc(briefs.createdAt),
  })
  const since = last?.createdAt.toISOString() ?? "epoch"
  // A source counts as new from when it was added here, not when it was first uploaded.
  const [counts] = ids.length
    ? await db.execute<{ ready: number; added: number }>(sql`
        select count(*)::int as ready,
          count(*) filter (where greatest(f.created_at,
            coalesce((select max(ff.added_at) from file_folders ff where ff.file_id = f.id), f.created_at)
          ) > ${since}::timestamptz)::int as added
        from files f
        where f.id in (${sql.join(
          ids.map((id) => sql`${id}`),
          sql`, `,
        )}) and f.status = 'ready' and f.deleted_at is null and f.kind <> 'note'
      `)
    : [{ ready: 0, added: 0 }]
  tracer.log({
    agent: "system",
    step: "brief",
    action: "checked_space",
    rowsReturned: counts?.ready ?? 0,
    detail: { added: counts?.added ?? 0, lastBrief: last?.id ?? null },
  })
  if (!counts?.ready) return quiet(`Nothing in ${about} to talk about yet.`)
  if (!counts.added) return quiet(`Nothing new in ${about} since the last brief.`)

  const [account] = await db
    .select({ guest: user.isAnonymous })
    .from(user)
    .where(eq(user.id, agent.ownerId))
  const [made] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(briefs)
    .where(
      and(eq(briefs.ownerId, agent.ownerId), sql`${briefs.createdAt} > now() - interval '1 day'`),
    )
  if ((made?.n ?? 0) >= (account?.guest ? BRIEF.guestPerDay : BRIEF.perDay))
    return quiet(`Today's audio briefs are used up; the next run will make this one.`)

  const id = randomUUID()
  await db.insert(briefs).values({
    id,
    ownerId: agent.ownerId,
    folderId: folder?.id ?? null,
    scope: agent.scope,
    title: about,
    runId: `brief-${id}`,
  })
  tracer.log({ agent: "system", step: "brief", action: "making_brief", detail: { briefId: id } })
  await makeBrief(id)
  const brief = await db.query.briefs.findFirst({ where: eq(briefs.id, id) })
  if (brief?.status !== "ready") throw new Error(brief?.problem ?? "The brief couldn't be made.")
  const minutes = Math.max(1, Math.round((brief.durationSeconds ?? 0) / 60))
  return {
    found: counts.added,
    summary: `A ${minutes}-minute brief on ${about}, with ${counts.added} new ${counts.added === 1 ? "source" : "sources"}.`,
    via: "elevenlabs",
    notified: true,
  }
}

/**
 * A run with nothing to report still says so in the Inbox (plan F34: every run lands there), as
 * one quiet slip per agent: each run clears the last one, so a weekly "nothing new" never piles
 * up and never outlives a run that did find something.
 */
async function noteRun(agent: Agent, runId: string, result: RunResult) {
  await db
    .update(inboxItems)
    .set({ dismissedAt: new Date() })
    .where(
      and(
        eq(inboxItems.ownerId, agent.ownerId),
        eq(inboxItems.kind, "agent-run"),
        isNull(inboxItems.dismissedAt),
        sql`${inboxItems.data}->>'agentId' = ${agent.id}`,
        sql`${inboxItems.data}->>'quiet' = 'true'`,
      ),
    )
  if (result.notified) return
  await notify(agent.ownerId, {
    kind: "agent-run",
    title: agent.name,
    body: result.summary,
    href: "/agents",
    data: { agentId: agent.id, runId, quiet: true },
    push: false,
  })
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
    const result: RunResult =
      agent.kind === "watch"
        ? await runWatch(agent, tracer)
        : agent.kind === "quiz"
          ? await runQuiz(agent, tracer)
          : await runBrief(agent, tracer)
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
    await noteRun(agent, run.id, result)
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

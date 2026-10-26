import { revealRound } from "@konkyo/db/live"
import { migrateDatabase } from "@konkyo/db/migrate"
import { boss, QUEUES } from "@konkyo/jobs"
import { ensureBucket } from "@konkyo/storage"
import { warmUp } from "@konkyo/zetaris"
import { queueDueAgents, runAgent } from "./agents"
import { makeArticleAssets } from "./articles"
import { makeBrief } from "./brief"
import { syncConnections } from "./connectors"
import { deepJob } from "./deep"
import { sendDigests } from "./digest"
import { expireHeldMail, handleInbound, inboundFailed } from "./inbound"
import { closeInterrupted } from "./interrupted"
import { indexNote } from "./notes"
import { ingestFile } from "./pipeline"
import { purgeAbandonedGuests, purgeExpired, purgeFiles } from "./purge"
import { reembedMissing } from "./reembed"
import { sendReminders } from "./reminders"
import { makeSet } from "./study"
import { backfillThumbs, makeThumb } from "./thumb"

/** Files processed at once in this worker (OCR, conversion and transcription are heavy). */
const INGEST_CONCURRENCY = 2

// The schema first (the worker is the one writer that applies migrations), then the bucket a fresh
// install doesn't have yet: no manual step on a new server.
await migrateDatabase()
await ensureBucket()
const queues = await boss({ worker: true })
void warmUp().then((ms) => console.info(`[zetaris] session ready in ${ms} ms`))

await queues.work(
  QUEUES.ingest.name,
  { includeMetadata: true, localConcurrency: INGEST_CONCURRENCY },
  async ([job]) => {
    if (!job) return
    const { fileId } = QUEUES.ingest.payload.parse(job.data)
    const started = performance.now()
    await ingestFile(fileId, { lastAttempt: job.retryCount >= job.retryLimit })
    console.info(`[ingest] ${fileId} done in ${Math.round(performance.now() - started)} ms`)
  },
)

// Polaroids for the wall (plan §16.4): light work, a few at a time; older sources get theirs once.
await queues.work(QUEUES.thumb.name, { localConcurrency: 3 }, async ([job]) => {
  if (job) await makeThumb(QUEUES.thumb.payload.parse(job.data).fileId)
})
void backfillThumbs().then((n) => n && console.info(`[thumb] queued ${n} older sources`))

// A live round's question timer ran out (plan F58): turn it face up.
await queues.work(QUEUES.roundTick.name, { localConcurrency: 4 }, async ([job]) => {
  if (!job) return
  const { roundId, version } = QUEUES.roundTick.payload.parse(job.data)
  await revealRound(roundId, version)
})

// An article's cover and cited pages (plan F57), drawn after it's published.
await queues.work(QUEUES.articleAssets.name, { localConcurrency: 2 }, async ([job]) => {
  if (job) await makeArticleAssets(QUEUES.articleAssets.payload.parse(job.data))
})

// Deep searches wait on ingest jobs, so they run beside them, a few at a time.
await queues.work(QUEUES.deep.name, { localConcurrency: 3 }, async ([job]) => {
  if (!job) return
  const { runId, phase } = QUEUES.deep.payload.parse(job.data)
  await deepJob(runId, phase)
})

// Audio briefs: one at a time per worker (each is a long ElevenLabs request).
await queues.work(QUEUES.brief.name, async ([job]) => {
  if (job) await makeBrief(QUEUES.brief.payload.parse(job.data).briefId)
})

// Practice sets run a few at a time beside ingest (each is mostly waiting on model calls).
await queues.work(QUEUES.study.name, { localConcurrency: 3 }, async ([job]) => {
  if (job) await makeSet(QUEUES.study.payload.parse(job.data).setId)
})

await queues.work(QUEUES.noteIndex.name, async ([job]) => {
  if (job) await indexNote(QUEUES.noteIndex.payload.parse(job.data).fileId)
})

await queues.work(QUEUES.purge.name, async ([job]) => {
  if (job) await purgeFiles(QUEUES.purge.payload.parse(job.data))
})

// Trash keeps things for 30 days, and abandoned guests go too; the sweep runs daily at 03:00 UTC.
const SWEEP = "purge-expired"
await queues.createQueue(SWEEP)
await queues.schedule(SWEEP, "0 3 * * *", {}, { tz: "UTC" })
await queues.work(SWEEP, async () => {
  const removed = await purgeExpired()
  if (removed) console.info(`[trash] deleted ${removed} files kept past 30 days`)
  const guests = await purgeAbandonedGuests()
  if (guests) console.info(`[guests] deleted ${guests} guests whose last session ran out`)
  const held = await expireHeldMail()
  if (held) console.info(`[inbound] let go of ${held} held emails nobody said yes to`)
})

// Agents (F34): due ones are queued every five minutes; runs go a few at a time.
await queues.work(QUEUES.agent.name, { localConcurrency: 3 }, async ([job]) => {
  if (!job) return
  const { agentId, trigger } = QUEUES.agent.payload.parse(job.data)
  await runAgent(agentId, trigger)
})
// Passages left without a vector get one: at start-up (the move to Nemotron's embeddings cleared
// them all) and again every five minutes, so a sweep that failed heals instead of waiting for a
// restart. One at a time; a sweep with nothing to do is a single query.
let healing = false
async function healVectors() {
  if (healing) return
  healing = true
  try {
    const { embedded, tokens } = await reembedMissing()
    if (embedded) console.info(`[reembed] ${embedded} passages, ${tokens} tokens`)
  } catch (error) {
    console.error(`[reembed] stopped: ${(error as Error).message}`)
  } finally {
    healing = false
  }
}
void healVectors()

const AGENTS_DUE = "agents-due"
await queues.createQueue(AGENTS_DUE)
await queues.schedule(AGENTS_DUE, "*/5 * * * *", {}, { tz: "UTC" })
await queues.work(AGENTS_DUE, async () => {
  const { queued } = await queueDueAgents()
  if (queued) console.info(`[agents] queued ${queued}`)
  await reportInterrupted()
  await healVectors()
})

// Practice, deep searches and agent runs a restart cut off are closed (checked with agents-due).
async function reportInterrupted() {
  const closed = await closeInterrupted()
  if (closed.sets + closed.deep + closed.agentRuns + closed.briefs)
    console.info(`[interrupted] closed ${JSON.stringify(closed)}`)
}
void reportInterrupted()

// Connectors (F35): changed Drive files and Notion pages are read again, and a Gmail watch
// brings in new matches, every 15 minutes (Composio-managed auth's fastest anyway).
const CONNECTORS_SYNC = "connectors-sync"
await queues.createQueue(CONNECTORS_SYNC)
await queues.schedule(CONNECTORS_SYNC, "*/15 * * * *", {}, { tz: "UTC" })
await queues.work(CONNECTORS_SYNC, async () => {
  const synced = await syncConnections()
  if (synced.refreshed + synced.imported) console.info(`[connectors] ${JSON.stringify(synced)}`)
})

// Mail to a space's address (F59): read, routed, its sources added or held for the owner.
await queues.work(QUEUES.inbound.name, { localConcurrency: 2 }, async ([job]) => {
  if (!job) return
  const { inboundId, approvedBy } = QUEUES.inbound.payload.parse(job.data)
  try {
    // the job's id claims the email: its own retries carry on, a second job finds it taken
    await handleInbound(inboundId, job.id, approvedBy)
  } catch (error) {
    // past the queue's retries it's marked failed and the owner told; before that, retried
    if (await inboundFailed(inboundId, error as Error)) throw error
    console.error(`[inbound] ${inboundId} failed: ${(error as Error).message}`)
  }
})

// The weekly digest (F59): hourly, each person on Friday at their own hour, when they asked for it.
const DIGEST = "weekly-digest"
await queues.createQueue(DIGEST)
await queues.schedule(DIGEST, "0 * * * *", {}, { tz: "UTC" })
await queues.work(DIGEST, async () => {
  const sent = await sendDigests()
  if (sent) console.info(`[digest] sent ${sent}`)
})

// Review reminders (F29): hourly, each person at their own hour in their own time zone.
const REMINDERS = "review-reminders"
await queues.createQueue(REMINDERS)
await queues.schedule(REMINDERS, "0 * * * *", {}, { tz: "UTC" })
await queues.work(REMINDERS, async () => {
  const sent = await sendReminders()
  if (sent) console.info(`[reminders] sent ${sent}`)
})

console.info(
  `[worker] listening on "${QUEUES.ingest.name}" (×${INGEST_CONCURRENCY}), "deep" (×3), "study" (×3), "purge", "article-assets" (×2), "round-tick" (×4), "inbound" (×2), daily sweep, hourly reminders and digests, agents every 5 min, connectors every 15 min`,
)

// On shutdown stop taking jobs and exit promptly: a job cut off here stops sending heartbeats and
// is retried by the next worker (ingest is idempotent: passages and evidence are replaced whole).
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await queues.stop({ graceful: true, timeout: 3_000 })
    process.exit(0)
  })
}

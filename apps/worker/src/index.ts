import { boss, QUEUES } from "@konkyo/jobs"
import { warmUp } from "@konkyo/zetaris"
import { deepJob } from "./deep"
import { indexNote } from "./notes"
import { ingestFile } from "./pipeline"
import { purgeExpired, purgeFiles } from "./purge"
import { makeSet } from "./study"

/** Files processed at once in this worker (OCR, conversion and transcription are heavy). */
const INGEST_CONCURRENCY = 2

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

// Deep searches wait on ingest jobs, so they run beside them, a few at a time.
await queues.work(QUEUES.deep.name, { localConcurrency: 3 }, async ([job]) => {
  if (!job) return
  const { runId, phase } = QUEUES.deep.payload.parse(job.data)
  await deepJob(runId, phase)
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

// Trash keeps things for 30 days; the sweep runs daily at 03:00 UTC.
const SWEEP = "purge-expired"
await queues.createQueue(SWEEP)
await queues.schedule(SWEEP, "0 3 * * *", {}, { tz: "UTC" })
await queues.work(SWEEP, async () => {
  const removed = await purgeExpired()
  if (removed) console.info(`[trash] deleted ${removed} files kept past 30 days`)
})

console.info(
  `[worker] listening on "${QUEUES.ingest.name}" (×${INGEST_CONCURRENCY}), "deep" (×3), "study" (×3), "purge", daily sweep`,
)

// On shutdown stop taking jobs and exit promptly: a job cut off here stops sending heartbeats and
// is retried by the next worker (ingest is idempotent: passages and evidence are replaced whole).
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await queues.stop({ graceful: true, timeout: 3_000 })
    process.exit(0)
  })
}

import { env } from "@konkyo/env/server"
import { PgBoss } from "pg-boss"
import { z } from "zod"

/** Every background queue, with the payload it carries (validated on both sides). */
export const QUEUES = {
  ingest: {
    name: "ingest",
    payload: z.object({ fileId: z.uuid() }),
    // A failed step retries with backoff; after that the file shows "Couldn't process" + Retry.
    options: { retryLimit: 2, retryDelay: 15, retryBackoff: true, expireInSeconds: 30 * 60 },
    // The worker refreshes a heartbeat while a job runs; if the worker dies (deploy, crash), the
    // job is retried within about a minute instead of waiting out its 30-minute expiry.
    send: { heartbeatSeconds: 30 },
  },
  /**
   * A deep search (plan F18), in two phases: "search" finds and screens sources and waits for
   * the person's choice; "import" brings the chosen ones in, waits until they're read, answers.
   */
  deep: {
    name: "deep",
    payload: z.object({ runId: z.uuid(), phase: z.enum(["search", "import"]) }),
    // Not retried: a half-done search would repeat its paid calls; the run says it failed.
    options: { retryLimit: 0, expireInSeconds: 20 * 60 },
    send: { heartbeatSeconds: 30 },
  },
  /** A practice set made from files or folders (F27): Tutor, Verifier, Zetaris per window. */
  study: {
    name: "study",
    payload: z.object({ setId: z.uuid() }),
    // Not retried: items already made are kept, and a second run would pay for them again.
    options: { retryLimit: 0, expireInSeconds: 15 * 60 },
    send: { heartbeatSeconds: 30 },
  },
  /** A note's text read into passages for chat (F21), once typing pauses. */
  noteIndex: {
    name: "note-index",
    payload: z.object({ fileId: z.uuid() }),
    options: { retryLimit: 2, retryDelay: 10, retryBackoff: true, expireInSeconds: 10 * 60 },
    send: {},
  },
  /** An audio brief (F37): script, checks, two voices, timing. Not retried: each run pays twice. */
  brief: {
    name: "brief",
    payload: z.object({ briefId: z.uuid() }),
    options: { retryLimit: 0, expireInSeconds: 15 * 60 },
    send: { heartbeatSeconds: 30 },
  },
  /** One agent run (F34): a watch checks for new papers, a quiz agent makes practice. */
  agent: {
    name: "agent",
    payload: z.object({ agentId: z.uuid(), trigger: z.enum(["schedule", "manual"]) }),
    options: { retryLimit: 0, expireInSeconds: 15 * 60 },
    send: { heartbeatSeconds: 30 },
  },
  /**
   * Removes a deleted file's stored bytes and Zetaris evidence (the rows are already gone). For a
   * deleted account it also drops its watch tables and its memory and World Model files.
   */
  purge: {
    name: "purge",
    payload: z.object({
      fileIds: z.array(z.uuid()),
      keys: z.array(z.string()),
      tables: z.array(z.string()).optional(),
      ownerId: z.string().optional(),
    }),
    options: { retryLimit: 5, retryDelay: 60, retryBackoff: true, expireInSeconds: 10 * 60 },
    send: {},
  },
} as const

export type QueueName = keyof typeof QUEUES
export type Payload<Q extends QueueName> = z.infer<(typeof QUEUES)[Q]["payload"]>

const globalForBoss = globalThis as unknown as { konkyoBoss?: Promise<PgBoss> }

/**
 * One pg-boss instance per process. Producers (the web app) skip maintenance and scheduling;
 * the worker passes `{ worker: true }` and owns both.
 */
export function boss({ worker = false } = {}): Promise<PgBoss> {
  globalForBoss.konkyoBoss ??= (async () => {
    const instance = new PgBoss({
      connectionString: env.DATABASE_URL,
      schema: "pgboss",
      supervise: worker,
      schedule: worker,
      application_name: worker ? "konkyo-worker" : "konkyo-web",
    })
    instance.on("error", (error) => console.error("[pg-boss]", error))
    await instance.start()
    for (const queue of Object.values(QUEUES)) {
      await instance.createQueue(queue.name, queue.options)
    }
    return instance
  })()
  return globalForBoss.konkyoBoss
}

/** Enqueues a job; the payload is checked against the queue's schema first. */
export async function enqueue<Q extends QueueName>(
  queue: Q,
  data: Payload<Q>,
  singletonKey?: string,
) {
  const parsed = QUEUES[queue].payload.parse(data)
  return (await boss()).send(QUEUES[queue].name, parsed, { ...QUEUES[queue].send, singletonKey })
}

/**
 * Enqueues a job at most once per window per key: a note saved every second while it's typed is
 * read into passages once the typing pauses.
 */
export async function enqueueDebounced<Q extends QueueName>(
  queue: Q,
  data: Payload<Q>,
  seconds: number,
  key: string,
) {
  const parsed = QUEUES[queue].payload.parse(data)
  return (await boss()).sendDebounced(QUEUES[queue].name, parsed, QUEUES[queue].send, seconds, key)
}

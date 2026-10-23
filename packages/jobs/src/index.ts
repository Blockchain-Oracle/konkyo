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

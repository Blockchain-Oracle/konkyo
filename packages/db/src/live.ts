import { sql } from "drizzle-orm"
import { type Db, db } from "./index"
import { type SpaceEventKind, spaceEvents } from "./schema"

/*
 * Live updates: one Postgres channel, `live`. Durable things that
 * happened in a space are rows in `space_events` (catch me up reads them, a reconnecting tab
 * replays them by id); every row is announced on the channel in the same transaction, so a
 * listener never hears of a row it can't read yet. Payloads carry ids only: a tab that hears one
 * refetches through the routes that check who may see what.
 */

export const LIVE_CHANNEL = "live"

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

export type LiveMessage =
  | {
      type: "event"
      spaceId: string
      id: number
      kind: SpaceEventKind
      subjectId: string | null
      actorId: string | null
    }
  | { type: "signal"; topic: string; kind: string; data: Record<string, unknown> }

/** Records something that happened in a space and announces it, in the caller's transaction. */
export async function spaceEvent(
  tx: Tx | Db,
  event: {
    spaceId: string
    actorId: string | null
    kind: SpaceEventKind
    subjectId?: string | null
    data?: Record<string, unknown>
  },
): Promise<number> {
  const [row] = await tx
    .insert(spaceEvents)
    .values({
      spaceId: event.spaceId,
      actorId: event.actorId,
      kind: event.kind,
      subjectId: event.subjectId ?? null,
      data: event.data ?? {},
    })
    .returning({ id: spaceEvents.id })
  const id = row?.id ?? 0
  const message: LiveMessage = {
    type: "event",
    spaceId: event.spaceId,
    id,
    kind: event.kind,
    subjectId: event.subjectId ?? null,
    actorId: event.actorId,
  }
  await tx.execute(sql`select pg_notify(${LIVE_CHANNEL}, ${JSON.stringify(message)})`)
  return id
}

/** One event per space a file is filed in (a source landed, got ready, failed, left). */
export async function fileSpaceEvents(
  tx: Tx | Db,
  fileId: string,
  kind: SpaceEventKind,
  actorId: string | null,
): Promise<void> {
  const rows = await tx.execute<{ space_id: string }>(sql`
    select distinct fo.space_id from file_folders ff
    join folders fo on fo.id = ff.folder_id and fo.deleted_at is null
    where ff.file_id = ${fileId}::uuid and fo.space_id is not null`)
  for (const r of rows)
    await spaceEvent(tx, { spaceId: r.space_id, actorId, kind, subjectId: fileId })
}

/** A passing signal nobody needs to replay (who's here, an answer's progress, a round's tick). */
export async function notifyLive(
  topic: string,
  kind: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  const message: LiveMessage = { type: "signal", topic, kind, data }
  // NOTIFY payloads are capped at 8000 bytes; signals carry ids and small numbers only.
  await db.execute(sql`select pg_notify(${LIVE_CHANNEL}, ${JSON.stringify(message)})`)
}

/**
 * A live round's question turns face up (F58): when its timer ran out, or when everyone has
 * answered (`everyone`). Compare-and-set on the version, so the last answer, a player's timer and
 * the worker's tick racing each other turn it once. Returns the new version, or null.
 */
export async function revealRound(
  roundId: string,
  version: number,
  everyone = false,
): Promise<number | null> {
  const rows = await db.execute<{ version: number }>(sql`
    update live_rounds set phase = 'reveal', version = version + 1, updated_at = now()
    where id = ${roundId}::uuid and version = ${version} and phase = 'question'
      and (${everyone} or ends_at <= now())
    returning version`)
  const next = rows[0]?.version ?? null
  if (next !== null) await notifyLive(`round:${roundId}`, "round", { v: next })
  return next
}

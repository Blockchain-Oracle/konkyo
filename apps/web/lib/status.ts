import "server-only"
import { db, schema } from "@konkyo/db"
import { and, count, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm"

const { files, runs } = schema

/** Run states that mean "working right now" (a deep search waiting on you is not working). */
const WORKING = ["running", "queued", "searching", "importing", "answering"] as const

/**
 * The live pill (plan §16.6, OurSpaces' pulse strip): what Konkyo is doing for this person right
 * now, from real rows only. Sources being read, runs working, and when the last answer finished.
 */
export async function liveStatus(ownerId: string) {
  const [[reading], [working], [last]] = await Promise.all([
    db
      .select({ n: count() })
      .from(files)
      .where(
        and(
          eq(files.ownerId, ownerId),
          isNull(files.deletedAt),
          inArray(files.status, ["queued", "processing"]),
        ),
      ),
    db
      .select({ n: count() })
      .from(runs)
      .where(and(eq(runs.ownerId, ownerId), inArray(runs.status, [...WORKING]))),
    db
      .select({ at: runs.finishedAt })
      .from(runs)
      .where(
        and(eq(runs.ownerId, ownerId), eq(runs.status, "answered"), isNotNull(runs.finishedAt)),
      )
      .orderBy(desc(runs.finishedAt))
      .limit(1),
  ])
  return {
    reading: reading?.n ?? 0,
    working: working?.n ?? 0,
    lastAnsweredAt: last?.at?.toISOString() ?? null,
  }
}

export type LiveStatus = Awaited<ReturnType<typeof liveStatus>>

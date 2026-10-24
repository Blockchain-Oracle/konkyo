import "server-only"
import { db } from "@konkyo/db"
import { sql } from "drizzle-orm"
import { cacheLife } from "next/cache"

export type LiveTotals = { spaces: number; sources: number; quotes: number }

/**
 * The landing's live counters (plan §16.8, section 4): real totals across Konkyo, cached for a
 * minute. "Quotes checked" counts every quote an answer's receipt verified plus every practice
 * question whose quote Zetaris confirmed: each was found word for word in its source.
 */
export async function liveTotals(): Promise<LiveTotals> {
  "use cache"
  cacheLife("minutes")
  const rows = await db.execute<{ spaces: number; sources: number; quotes: number }>(sql`
    select
      (select count(*) from folders where parent_id is null and deleted_at is null)::int as spaces,
      (select count(*) from files where deleted_at is null and status = 'ready')::int as sources,
      (
        (select coalesce(sum((p->'data'->>'quotes')::int), 0)
           from messages m, jsonb_array_elements(m.parts) p
          where p->>'type' = 'data-receipt')
        + (select count(*) from study_items where "check"->>'zetaris' = 'true')
      )::int as quotes
  `)
  const row = rows[0]
  return { spaces: row?.spaces ?? 0, sources: row?.sources ?? 0, quotes: row?.quotes ?? 0 }
}

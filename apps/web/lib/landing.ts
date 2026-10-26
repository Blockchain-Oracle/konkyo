import "server-only"
import { db } from "@konkyo/db"
import { sql } from "drizzle-orm"
import { cacheLife } from "next/cache"

export type LiveTotals = { spaces: number; sources: number; quotes: number }

/**
 * The landing's live counters (plan §16.8, section 4): running totals across Konkyo (the most
 * each has reached), cached for a minute. "Quotes checked" counts every quote an answer's receipt verified (in chats and on public
 * spaces) plus every practice question whose quote Zetaris confirmed: each was found word for word
 * in its source.
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
        + (select coalesce(sum(quotes), 0) from share_answers)
        + (select count(*) from study_items where "check"->>'zetaris' = 'true')
      )::int as quotes
  `)
  const row = rows[0]
  const now = { spaces: row?.spaces ?? 0, sources: row?.sources ?? 0, quotes: row?.quotes ?? 0 }
  // Running totals: each keeps the highest it has reached, so deleted guests never lower them.
  const kept = await db.execute<{ key: keyof LiveTotals; value: number }>(sql`
    insert into site_totals (key, value)
    values ('spaces', ${now.spaces}), ('sources', ${now.sources}), ('quotes', ${now.quotes})
    on conflict (key) do update
      set value = greatest(site_totals.value, excluded.value), updated_at = now()
    returning key, value
  `)
  const most = Object.fromEntries(kept.map((r) => [r.key, r.value]))
  return {
    spaces: most.spaces ?? now.spaces,
    sources: most.sources ?? now.sources,
    quotes: most.quotes ?? now.quotes,
  }
}

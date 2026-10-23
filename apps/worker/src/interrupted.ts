import { Tracer } from "@konkyo/agents"
import { db } from "@konkyo/db"
import { sql } from "drizzle-orm"
import { finish } from "./deep"

/**
 * Work a restart cut off (a deploy, a crash). The study, deep and agent queues never retry (a
 * rerun would pay for its model calls twice), so nothing else would ever close these rows: a
 * practice set stayed "generating" forever after a restart on testing. Each is closed once it has
 * been quiet longer than its slowest step could take; runs at start-up and every five minutes.
 */
export async function closeInterrupted() {
  // A set saves after every window (≤3 min with a slow model call and Zetaris's 90 s deadline).
  const sets = await db.execute<{ id: string; run_id: string | null; made: number }>(sql`
    update study_sets
    set status = case when made > 0 then 'ready' else 'failed' end,
      problem = case when made > 0 then null
        else 'Making this practice was interrupted. Try again.' end
    where status = 'generating' and updated_at < now() - interval '6 minutes'
    returning id, run_id, made
  `)
  for (const set of sets) {
    const tracer = new Tracer(set.run_id ?? `study-${set.id}`)
    tracer.log({
      agent: "system",
      step: "study",
      action: "set_interrupted",
      rowsReturned: set.made,
      detail: { kept: set.made },
    })
    await tracer.flush()
  }

  // A deep search reports as it goes; waiting on imports is at most 8 minutes.
  const deep = await db.execute<{ id: string }>(sql`
    select r.id from runs r
    where r.kind = 'deep' and r.status in ('queued', 'searching', 'importing', 'answering')
      and greatest(r.created_at, (select max(e.created_at) from run_events e where e.run_id = r.id))
        < now() - interval '15 minutes'
  `)
  for (const run of deep)
    await finish(run.id, "failed", "The search was interrupted. Try again.").catch(() => undefined)

  // A brief's slowest step is the dialogue request (about 30 s for two minutes of audio).
  const briefs = await db.execute<{ id: string }>(sql`
    update briefs set status = 'failed', problem = 'Making this brief was interrupted. Try again.'
    where status = 'making' and updated_at < now() - interval '10 minutes'
    returning id
  `)

  // An agent run's job expires after 15 minutes.
  const agentRuns = await db.execute<{ id: string }>(sql`
    update agent_runs set status = 'failed', summary = 'Interrupted. It runs again at its next time.',
      ended_at = now()
    where status = 'running' and started_at < now() - interval '20 minutes'
    returning id
  `)
  return {
    sets: sets.length,
    deep: deep.length,
    agentRuns: agentRuns.length,
    briefs: briefs.length,
  }
}

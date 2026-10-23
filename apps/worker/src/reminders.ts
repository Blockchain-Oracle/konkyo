import { db } from "@konkyo/db"
import { notify } from "@konkyo/notify"
import { dayIn } from "@konkyo/study"
import { sql } from "drizzle-orm"

const hourIn = (date: Date, timeZone: string) =>
  Number(
    new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", hourCycle: "h23" }).format(date),
  )

/** Few, varied reminders (plan F31): the wording changes from day to day, and never nags. */
const PHRASES: ((n: number, streak: number) => string)[] = [
  (n) => `${n} ${n === 1 ? "card is" : "cards are"} ready for today's review`,
  (n, streak) =>
    streak > 1 ? `Keep your ${streak}-day streak: ${n} to review` : `${n} to review, a few minutes`,
  (n) => `Today's review: ${n} ${n === 1 ? "card" : "cards"} from your own sources`,
  (n) => `${n} ${n === 1 ? "thing" : "things"} worth recalling today`,
]

/**
 * Hourly (F29): everyone whose reminder hour it is now, in their own time zone, with something
 * due and no round yet today, gets one reminder in the Inbox and on their devices. People who
 * have never finished a round have no time zone yet, so they get none.
 */
export async function sendReminders(now = new Date()) {
  const people = await db.execute<{
    user_id: string
    time_zone: string
    reminder_hour: number
    daily_new: number
  }>(sql`
    select user_id, time_zone, reminder_hour, daily_new from user_settings
    where review_reminders and time_zone is not null
  `)
  let sent = 0
  for (const p of people) {
    let hour: number
    try {
      hour = hourIn(now, p.time_zone)
    } catch {
      continue
    }
    if (hour !== p.reminder_hour) continue
    const today = dayIn(now, p.time_zone)
    const [row] = await db.execute<{
      studied: boolean
      reminded: boolean
      due: number
      streak: number
    }>(sql`
      with bounds as (
        select (date_trunc('day', now() at time zone ${p.time_zone})) at time zone ${p.time_zone} as start,
          (date_trunc('day', now() at time zone ${p.time_zone}) + interval '1 day') at time zone ${p.time_zone} as "end"
      ), live as (
        select i.passage_id, c.state, c.due from study_items i
        join study_cards c on c.item_id = i.id
        join files f on f.id = i.file_id and f.deleted_at is null
        where i.owner_id = ${p.user_id} and i.status = 'active'
      )
      select
        exists (select 1 from study_days where owner_id = ${p.user_id} and day = ${today}::date and kind = 'done') as studied,
        exists (select 1 from inbox_items, bounds where owner_id = ${p.user_id} and kind = 'review' and created_at >= bounds.start) as reminded,
        (select count(distinct passage_id) from live, bounds where state <> 0 and due < bounds."end")::int
          + least(${p.daily_new}, (select count(distinct passage_id) from live where state = 0))::int as due,
        (select count(*) from study_days where owner_id = ${p.user_id} and day >= ${today}::date - 30 and kind = 'done')::int as streak
    `)
    if (!row || row.studied || row.reminded || !row.due) continue
    const phrase = PHRASES[Number(today.slice(-2)) % PHRASES.length] ?? PHRASES[0]
    await notify(p.user_id, {
      kind: "review",
      title: phrase?.(row.due, row.streak) ?? `${row.due} to review`,
      body: `About ${Math.max(2, Math.round(row.due * 0.5))} minutes. Every answer opens its passage.`,
      href: "/study/session?mode=review",
      tag: "review",
    })
    sent++
  }
  return sent
}

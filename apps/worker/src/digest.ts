import { APP, EMAIL } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { emailReady, sendEmail } from "@konkyo/email"
import { type DigestSection, digestEmail } from "@konkyo/email/templates"
import { eq, sql } from "drizzle-orm"

const { userSettings } = schema

/** The person's local weekday (1 = Monday … 7 = Sunday) and hour. */
function localNow(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now)
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(
    parts.find((p) => p.type === "weekday")?.value ?? "",
  )
  return { weekday: weekday + 1, hour: Number(parts.find((p) => p.type === "hour")?.value) }
}

/** ISO week, "2026-W43": a digest goes out once in it, whatever restarts happen. */
function isoWeek(date: Date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - start.getTime()) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** What one person's week held, in sections; empty sections are left out by the template. */
async function weekOf(userId: string): Promise<DigestSection[]> {
  const spaces = await db.execute<{
    id: string
    name: string
    sources: number
    briefs: number
  }>(sql`
    with mine as (
      select f.id, f.name from folders f
      where f.deleted_at is null and f.space_id = f.id and f.owner_id = ${userId}
      union
      select f.id, f.name from folders f join space_members m on m.space_id = f.id
      where f.deleted_at is null and m.user_id = ${userId}
    )
    select mine.id, mine.name,
      (select count(*) from space_events e where e.space_id = mine.id and e.kind = 'source_ready'
        and e.created_at > now() - interval '7 days')::int as sources,
      (select count(*) from space_events e where e.space_id = mine.id and e.kind = 'brief_ready'
        and e.created_at > now() - interval '7 days')::int as briefs
    from mine`)
  const [study] = await db.execute<{ due: number }>(sql`
    select count(distinct i.passage_id)::int as due from study_items i
    join study_cards c on c.item_id = i.id
    join files f on f.id = i.file_id and f.deleted_at is null
    where i.owner_id = ${userId} and i.status = 'active' and c.state <> 0 and c.due < now() + interval '1 day'`)
  const found = await db.execute<{ title: string }>(sql`
    select title from inbox_items
    where owner_id = ${userId} and kind = 'new-source' and dismissed_at is null
      and created_at > now() - interval '7 days'
    order by created_at desc limit 4`)

  const lively = spaces.filter((s) => s.sources || s.briefs)
  return [
    {
      title: "In your spaces",
      lines: lively.map((s) => ({
        text: `${s.name}: ${[s.sources ? plural(s.sources, "new source") : "", s.briefs ? plural(s.briefs, "audio brief") : ""].filter(Boolean).join(", ")}`,
        href: `${APP.url}/spaces/${s.id}`,
      })),
    },
    {
      title: "Practice",
      lines: study?.due
        ? [
            {
              text: `${plural(study.due, "card")} ready for review`,
              href: `${APP.url}/study/session?mode=review`,
            },
          ]
        : [],
    },
    {
      title: "New papers your watches found",
      lines: found.map((f) => ({ text: f.title, href: `${APP.url}/inbox` })),
    },
  ]
}

/**
 * The weekly digest, hourly: everyone who turned it on gets one on Friday at their
 * reminder hour in their own time zone (UTC when Konkyo doesn't know it yet), once a week, and
 * only when the week held something. Sent through Resend with the week as its idempotency key.
 */
export async function sendDigests(now = new Date()) {
  if (!emailReady()) return 0
  const people = await db.execute<{
    user_id: string
    email: string
    name: string
    time_zone: string | null
    reminder_hour: number
    digest_week: string | null
  }>(sql`
    select s.user_id, u.email, u.name, s.time_zone, s.reminder_hour, s.digest_week
    from user_settings s join "user" u on u.id = s.user_id
    where s.weekly_digest and coalesce(u.is_anonymous, false) = false`)
  const week = isoWeek(now)
  let sent = 0
  for (const p of people) {
    if (p.digest_week === week) continue
    let local: { weekday: number; hour: number }
    try {
      local = localNow(now, p.time_zone ?? "UTC")
    } catch {
      continue
    }
    if (local.weekday !== EMAIL.digestWeekday || local.hour !== p.reminder_hour) continue
    const sections = await weekOf(p.user_id)
    // Marked first: a send that fails is skipped this week rather than retried every hour.
    await db
      .update(userSettings)
      .set({ digestWeek: week })
      .where(eq(userSettings.userId, p.user_id))
    if (!sections.some((s) => s.lines.length)) continue
    const mail = digestEmail({
      name: p.name.split(" ")[0] || "there",
      week: `The week to ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: p.time_zone ?? "UTC" }).format(now)}`,
      sections,
      settingsUrl: `${APP.url}/settings#notifications`,
    })
    try {
      await sendEmail({
        to: p.email,
        ...mail,
        kind: "digest",
        idempotencyKey: `digest/${p.user_id}/${week}`,
      })
      sent++
    } catch (error) {
      console.error("[digest]", p.user_id, (error as Error).message)
    }
  }
  return sent
}

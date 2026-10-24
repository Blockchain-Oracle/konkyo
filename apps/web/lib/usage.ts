import "server-only"
import { BRIEF, LIMITS, STUDY, VOICE } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { eq, sql } from "drizzle-orm"

const { user } = schema

const DAY_MS = 86_400_000

/**
 * Fair-use allowances (plan F38): each one is a count over the last 24 hours, lower for guests.
 * The same rules stop a request and fill Settings → Usage, so the page never disagrees with
 * what the app does.
 */
const RULES = {
  questions: {
    label: "Questions",
    about: "Every chat answer and deep search counts.",
    limit: (guest: boolean) => (guest ? LIMITS.guestAnswersPerDay : LIMITS.answersPerDay),
    rows: (ownerId: string, since: string) =>
      sql`select created_at from runs where owner_id = ${ownerId} and created_at >= ${since}::timestamptz`,
    reached: (guest: boolean, limit: number) =>
      guest
        ? `Guests can ask ${limit} questions a day. Continue with Google to keep going.`
        : "You've asked a lot today. Each question frees up 24 hours after you asked it.",
  },
  deepSearches: {
    label: "Deep searches",
    about: "Each one searches the web and scholarly databases and imports what it finds.",
    limit: (guest: boolean) => (guest ? LIMITS.guestDeepSearchesPerDay : LIMITS.deepSearchesPerDay),
    rows: (ownerId: string, since: string) =>
      sql`select created_at from runs where owner_id = ${ownerId} and kind = 'deep' and created_at >= ${since}::timestamptz`,
    reached: (guest: boolean, limit: number) =>
      guest
        ? `Guests can run ${limit} deep searches a day. Continue with Google for more.`
        : "You've run a lot of deep searches today. Each one frees up 24 hours after it started.",
  },
  practiceSets: {
    label: "Practice sets",
    about: "Each Quiz me, and each run of a scheduled quiz.",
    limit: (guest: boolean) => (guest ? STUDY.guestSetsPerDay : STUDY.setsPerDay),
    rows: (ownerId: string, since: string) =>
      sql`select created_at from study_sets where owner_id = ${ownerId} and created_at >= ${since}::timestamptz`,
    reached: (guest: boolean, limit: number) =>
      guest
        ? `Guests can make ${limit} practice sets a day. Continue with Google to keep going.`
        : "You've made a lot of practice today. Each set frees up 24 hours after it was made.",
  },
  audioBriefs: {
    label: "Audio briefs",
    about: "Each brief is two voices talking through a folder.",
    limit: (guest: boolean) => (guest ? BRIEF.guestPerDay : BRIEF.perDay),
    rows: (ownerId: string, since: string) =>
      sql`select created_at from briefs where owner_id = ${ownerId} and created_at >= ${since}::timestamptz`,
    reached: (guest: boolean, limit: number) =>
      guest
        ? `Guests can make ${limit} audio brief a day. Continue with Google for more.`
        : `You've made ${limit} audio briefs today. Each one frees up 24 hours after it was made.`,
  },
  files: {
    label: "Files added",
    about: "Uploads, links and the sources deep search imports. Notes don't count.",
    limit: (guest: boolean) => (guest ? LIMITS.guestFilesPerDay : LIMITS.filesPerDay),
    rows: (ownerId: string, since: string) =>
      sql`select created_at from files where owner_id = ${ownerId} and kind <> 'note' and created_at >= ${since}::timestamptz`,
    reached: (guest: boolean, limit: number) =>
      guest
        ? `Guests can add ${limit} files a day. Continue with Google to add more.`
        : `You've added ${limit} files today. Each one frees up 24 hours after it was added.`,
  },
  voiceSessions: {
    label: "Voice",
    about: "Each time you talk to Konkyo through the orb (up to 15 minutes each).",
    limit: (guest: boolean) => (guest ? VOICE.guestSessionsPerDay : VOICE.sessionsPerDay),
    rows: (ownerId: string, since: string) =>
      sql`select created_at, amount from voice_usage where owner_id = ${ownerId} and kind = 'listen' and created_at >= ${since}::timestamptz`,
    reached: (guest: boolean, limit: number) =>
      guest
        ? `Guests can talk to Konkyo ${limit} times a day. Continue with Google for more, or type instead.`
        : "Voice is resting for today. Type instead; it frees up 24 hours after you used it.",
  },
  readAloud: {
    label: "Read aloud",
    about: "Characters of answers read to you. A clip already made is free.",
    limit: (guest: boolean) => (guest ? VOICE.guestSpeakCharsPerDay : VOICE.speakCharsPerDay),
    rows: (ownerId: string, since: string) =>
      sql`select created_at, amount from voice_usage where owner_id = ${ownerId} and kind = 'speak' and created_at >= ${since}::timestamptz`,
    reached: () => "Read-aloud is resting for today. It frees up 24 hours after it was used.",
  },
} as const

export type Allowance = keyof typeof RULES

export type UsageLine = {
  key: Allowance
  label: string
  about: string
  used: number
  limit: number
  /** When the next one frees up, if all are used (ISO). */
  nextFreeAt: string | null
}

async function isGuest(ownerId: string) {
  const row = await db.query.user.findFirst({
    where: eq(user.id, ownerId),
    columns: { isAnonymous: true },
  })
  return Boolean(row?.isAnonymous)
}

async function lineFor(ownerId: string, key: Allowance, guest: boolean): Promise<UsageLine> {
  const rule = RULES[key]
  const limit = rule.limit(guest)
  const rows = await db.execute<{ created_at: string; amount?: number }>(
    // Raw templates hand values to the driver unconverted, and it rejects a Date: an ISO string.
    sql`${rule.rows(ownerId, new Date(Date.now() - DAY_MS).toISOString())} order by created_at`,
  )
  // a row counts one, or its amount (characters read aloud)
  const used = rows.reduce((sum, r) => sum + (r.amount ?? 1), 0)
  // With every slot taken, a slot frees up when the oldest counted one turns 24 hours old.
  const oldest = used >= limit ? rows[Math.max(0, rows.length - limit)] : undefined
  return {
    key,
    label: rule.label,
    about: rule.about,
    used,
    limit,
    nextFreeAt: oldest
      ? new Date(new Date(oldest.created_at).getTime() + DAY_MS).toISOString()
      : null,
  }
}

/** Settings → Usage: every allowance with what's used. */
export async function usageOf(ownerId: string) {
  const guest = await isGuest(ownerId)
  const lines = await Promise.all(
    (Object.keys(RULES) as Allowance[]).map((key) => lineFor(ownerId, key, guest)),
  )
  return { guest, lines }
}

/**
 * Whether this person may use one more of an allowance; the reason in plain words when not.
 * `adding` checks room for several at once (a folder upload).
 */
export async function allowanceLeft(
  ownerId: string,
  key: Allowance,
  adding = 1,
): Promise<string | null> {
  const guest = await isGuest(ownerId)
  const line = await lineFor(ownerId, key, guest)
  return line.used + adding > line.limit ? RULES[key].reached(guest, line.limit) : null
}

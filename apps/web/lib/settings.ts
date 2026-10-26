import "server-only"
import { VOICE } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { emailReady } from "@konkyo/email"
import { and, eq, isNull } from "drizzle-orm"

const { userSettings, user } = schema

/** A stored voice that's still on offer, else Konkyo's own. */
export const voiceOf = (id: string | null | undefined) =>
  VOICE.voices.find((voice) => voice.id === id)?.id ?? VOICE.speaker.id

export type Settings = {
  autoImportSources: boolean
  citationStyle: string
  studySound: boolean
  dailyNew: number
  reviewReminders: boolean
  reminderHour: number
  /** Taps, places and checks. */
  interfaceSounds: boolean
  /** Konkyo says the short answer out loud after a spoken ask (S16). */
  readAloud: boolean
  /** The voice it answers in: one of VOICE.voices. */
  voiceId: string
  /** The weekly digest by email, Fridays at reminderHour (F59). */
  weeklyDigest: boolean
  /** Konkyo can email this person: the server sends email and they have a real address. */
  canEmail: boolean
  /** First run is over (a starter chosen or skipped). */
  onboarded: boolean
}

/** The person's settings, with defaults for anything never set. */
export async function getSettings(userId: string): Promise<Settings> {
  const [row, person] = await Promise.all([
    db.query.userSettings.findFirst({ where: eq(userSettings.userId, userId) }),
    db.query.user.findFirst({ where: eq(user.id, userId), columns: { isAnonymous: true } }),
  ])
  return {
    autoImportSources: row?.autoImportSources ?? false,
    citationStyle: row?.citationStyle ?? "apa",
    studySound: row?.studySound ?? true,
    dailyNew: row?.dailyNew ?? 15,
    reviewReminders: row?.reviewReminders ?? true,
    reminderHour: row?.reminderHour ?? 18,
    interfaceSounds: row?.interfaceSounds ?? true,
    readAloud: row?.readAloud ?? true,
    voiceId: voiceOf(row?.voiceId),
    weeklyDigest: row?.weeklyDigest ?? false,
    canEmail: emailReady() && Boolean(person) && !person?.isAnonymous,
    onboarded: Boolean(row?.onboardedAt),
  }
}

/**
 * Whether Home opens on first run ("what are you here for?"): not onboarded and no files yet. Read
 * on the server so the right Home is in the first HTML, not swapped in after two fetches (in testing).
 */
export async function isFirstRun(userId: string) {
  const [row, file] = await Promise.all([
    db.query.userSettings.findFirst({
      where: eq(userSettings.userId, userId),
      columns: { onboardedAt: true },
    }),
    db.query.files.findFirst({
      where: and(eq(schema.files.ownerId, userId), isNull(schema.files.deletedAt)),
      columns: { id: true },
    }),
  ])
  return !row?.onboardedAt && !file
}

export async function updateSettings(
  userId: string,
  patch: Partial<Omit<Settings, "onboarded" | "canEmail">>,
) {
  await db
    .insert(userSettings)
    .values({ userId, ...patch })
    .onConflictDoUpdate({ target: userSettings.userId, set: patch })
  return getSettings(userId)
}

/** First run is over: Home stops offering the starters (F39). */
export async function markOnboarded(userId: string) {
  const now = new Date()
  await db
    .insert(userSettings)
    .values({ userId, onboardedAt: now })
    .onConflictDoUpdate({ target: userSettings.userId, set: { onboardedAt: now } })
}

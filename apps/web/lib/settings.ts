import "server-only"
import { db, schema } from "@konkyo/db"
import { eq } from "drizzle-orm"

const { userSettings } = schema

export type Settings = {
  autoImportSources: boolean
  citationStyle: string
  studySound: boolean
  dailyNew: number
  reviewReminders: boolean
  reminderHour: number
  /** First run is over (a starter chosen or skipped). */
  onboarded: boolean
}

/** The person's settings, with defaults for anything never set. */
export async function getSettings(userId: string): Promise<Settings> {
  const row = await db.query.userSettings.findFirst({ where: eq(userSettings.userId, userId) })
  return {
    autoImportSources: row?.autoImportSources ?? false,
    citationStyle: row?.citationStyle ?? "apa",
    studySound: row?.studySound ?? true,
    dailyNew: row?.dailyNew ?? 15,
    reviewReminders: row?.reviewReminders ?? true,
    reminderHour: row?.reminderHour ?? 18,
    onboarded: Boolean(row?.onboardedAt),
  }
}

export async function updateSettings(userId: string, patch: Partial<Omit<Settings, "onboarded">>) {
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

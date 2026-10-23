import "server-only"
import { db, schema } from "@konkyo/db"
import { eq } from "drizzle-orm"

const { userSettings } = schema

export type Settings = { autoImportSources: boolean; citationStyle: string }

/** The person's settings, with defaults for anything never set. */
export async function getSettings(userId: string): Promise<Settings> {
  const row = await db.query.userSettings.findFirst({ where: eq(userSettings.userId, userId) })
  return {
    autoImportSources: row?.autoImportSources ?? false,
    citationStyle: row?.citationStyle ?? "apa",
  }
}

export async function updateSettings(userId: string, patch: Partial<Settings>) {
  await db
    .insert(userSettings)
    .values({ userId, ...patch })
    .onConflictDoUpdate({ target: userSettings.userId, set: patch })
  return getSettings(userId)
}

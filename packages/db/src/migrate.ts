import { migrate } from "drizzle-orm/postgres-js/migrator"
import { db } from "./index"

/**
 * Applies the SQL migrations in packages/db/drizzle (plan S11). The worker runs this at start, so a
 * production image needs no drizzle-kit: the migrator is part of drizzle-orm and records what it
 * applied in its own table, so a second run does nothing.
 */
export async function migrateDatabase() {
  await migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname })
}

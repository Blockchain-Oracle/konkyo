/**
 * `pnpm services:check`: one line per service, exit 1 if any is down.
 * Runs with Node's built-in TypeScript support and the repo's .env.
 */
import { env } from "@konkyo/env/server"
import { ensureBucket, storageReady } from "@konkyo/storage"
import postgres from "postgres"

const PROBE_TIMEOUT_MS = 5_000

type Check = { name: string; run: () => Promise<string> }

const httpUp = async (url: string) => {
  // Any HTTP answer means the server is listening; a network error means it isn't.
  const res = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
  return `HTTP ${res.status}`
}

const checks: Check[] = [
  {
    name: "Postgres + pgvector",
    run: async () => {
      const sql = postgres(env.DATABASE_URL, { max: 1, connect_timeout: PROBE_TIMEOUT_MS / 1000 })
      try {
        const [row] = await sql<{ version: string | null }[]>`
          select default_version as version from pg_available_extensions where name = 'vector'`
        if (!row?.version) throw new Error("pgvector extension not available")
        return `pgvector ${row.version} available`
      } finally {
        await sql.end()
      }
    },
  },
  {
    name: "S3 storage (RustFS)",
    run: async () => {
      await ensureBucket()
      if (!(await storageReady())) throw new Error("bucket not reachable")
      return "bucket ready"
    },
  },
  { name: "Gotenberg", run: () => httpUp(new URL("/health", env.GOTENBERG_URL).href) },
  { name: "Zetaris REST", run: () => httpUp(env.ZETARIS_REST_URL) },
]

let failed = 0
for (const check of checks) {
  try {
    console.log(`✓ ${check.name}: ${await check.run()}`)
  } catch (error) {
    failed++
    console.log(`✗ ${check.name}: ${error instanceof Error ? error.message : String(error)}`)
  }
}
process.exit(failed ? 1 : 0)

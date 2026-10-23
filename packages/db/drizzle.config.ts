import { defineConfig } from "drizzle-kit"

// drizzle-kit runs from this package; the one .env lives at the repo root.
try {
  process.loadEnvFile("../../.env")
} catch {
  // CI and Docker pass DATABASE_URL directly.
}

const url = process.env.DATABASE_URL
if (!url) throw new Error("DATABASE_URL is not set")

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: { url },
  strict: true,
})

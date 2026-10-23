#!/usr/bin/env node
/**
 * Runs a command with the repo-root .env loaded, e.g. `node scripts/with-env.mjs next dev`.
 * Next.js reads .env only from its own app folder, and Node refuses --env-file inside
 * NODE_OPTIONS (which Next passes to its workers), so the env is loaded here and inherited.
 * Variables already set in the shell or CI win over the file.
 */
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

const envFile = resolve(import.meta.dirname, "..", ".env")
if (existsSync(envFile)) process.loadEnvFile(envFile)

const [command, ...args] = process.argv.slice(2)
if (!command) {
  console.error("usage: with-env.mjs <command> [...args]")
  process.exit(2)
}

const child = spawn(command, args, { stdio: "inherit", env: process.env })
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal))
child.on("exit", (code, signal) =>
  signal ? process.kill(process.pid, signal) : process.exit(code ?? 0),
)

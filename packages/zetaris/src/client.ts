import { randomUUID } from "node:crypto"
import { ZETARIS } from "@konkyo/config"
import { env } from "@konkyo/env/server"
import { taped } from "@konkyo/tape"

/** Zetaris returns values as strings (or null); rows are keyed by column name here. */
export type Row = Record<string, string | null>

export type QueryResult = {
  rows: Row[]
  total: number
  /** Server-side time reported by Zetaris. */
  serverMs: number
  /** Wall time seen by the client. */
  wallMs: number
  queryId: string
}

export class ZetarisError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly sql: string,
  ) {
    super(message)
    this.name = "ZetarisError"
  }
}

/** A login, and when it stops working (a Zetaris id token lasts 15 minutes). */
let cachedToken: { token: string; org: string; expiresAt: number } | undefined
let loggingIn: Promise<{ token: string; org: string; expiresAt: number }> | undefined

/** Renew this long before the token's own expiry, so no query is sent with a dying one. */
const RENEW_BEFORE_MS = 90_000

/** The `exp` of a JWT, in ms; ten minutes from now if it can't be read. */
function expiryOf(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString())
    if (typeof payload.exp === "number") return payload.exp * 1000
  } catch {}
  return Date.now() + 10 * 60_000
}

/** Finds the first non-empty value of any of `keys`, at any depth (login payloads vary by version). */
function find(obj: unknown, keys: string[]): string | undefined {
  if (!obj || typeof obj !== "object") return undefined
  for (const key of keys) {
    const value = (obj as Record<string, unknown>)[key]
    if (value) return String(value)
  }
  for (const value of Object.values(obj)) {
    const hit = find(value, keys)
    if (hit) return hit
  }
  return undefined
}

async function auth(force = false): Promise<{ token: string; org: string }> {
  if (env.ZETARIS_API_KEY) return { token: env.ZETARIS_API_KEY, org: env.ZETARIS_ORG_ID ?? "1" }
  if (cachedToken && !force && cachedToken.expiresAt - Date.now() > RENEW_BEFORE_MS)
    return cachedToken
  // One login at a time: every query waiting on an expired token shares it.
  loggingIn ??= login().finally(() => {
    loggingIn = undefined
  })
  cachedToken = await loggingIn
  return cachedToken
}

async function login() {
  if (!env.ZETARIS_LOGIN_URL || !env.ZETARIS_USERNAME || !env.ZETARIS_PASSWORD) {
    throw new Error("Zetaris needs ZETARIS_API_KEY, or ZETARIS_LOGIN_URL + USERNAME + PASSWORD")
  }
  const res = await fetch(env.ZETARIS_LOGIN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: env.ZETARIS_USERNAME, password: env.ZETARIS_PASSWORD }),
  })
  const body: unknown = await res.json().catch(() => null)
  const token = find(body, ["idToken", "accessToken", "token", "access_token"])
  if (!res.ok || !token) throw new Error(`Zetaris login failed (HTTP ${res.status})`)
  return {
    token,
    org: find(body, ["orgId"]) ?? env.ZETARIS_ORG_ID ?? "1",
    expiresAt: expiryOf(token),
  }
}

async function cancel(queryId: string, token: string, org: string): Promise<void> {
  await fetch(`${env.ZETARIS_REST_URL}/sql-editor/sqls/history/${queryId}/cancel`, {
    headers: { authorization: `Bearer ${token}`, "x-org-id": org },
  }).catch(() => undefined)
}

/**
 * Runs one Lightning SQL statement (any statement: DDL, CREATE LIGHTNING …, SELECT) through the
 * SQL-editor REST route. Applies our own deadline and cancels the query when it passes, because an
 * abandoned Zetaris job keeps the engine busy and blocks every other query.
 */
export const run = taped(
  "zetaris.run",
  runWithRetry,
  (sql: string, options?: { limit?: number }) => [sql, options?.limit],
)

async function runWithRetry(
  sql: string,
  options: { limit?: number; timeoutMs?: number } = {},
): Promise<QueryResult> {
  try {
    return await runOnce(sql, options)
  } catch (error) {
    // A table being re-published by the worker, or a hiccup in the Spark session, fails one
    // statement with a 400/5xx that succeeds a moment later: retry once. Deadlines don't retry.
    const status = (error as ZetarisError).status
    if (!(error instanceof ZetarisError) || status === 408 || status === 401) throw error
    await new Promise((resolve) => setTimeout(resolve, 400))
    return runOnce(sql, options)
  }
}

async function runOnce(
  sql: string,
  {
    limit = ZETARIS.rowLimit,
    timeoutMs = ZETARIS.queryTimeoutMs,
  }: { limit?: number; timeoutMs?: number } = {},
): Promise<QueryResult> {
  const queryId = randomUUID()
  const started = performance.now()
  for (let attempt = 0; attempt < 2; attempt++) {
    const { token, org } = await auth(attempt > 0)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(`${env.ZETARIS_REST_URL}/sql-editor/sqls/run`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          "x-org-id": org,
          "x-request-id": randomUUID(),
        },
        body: JSON.stringify({ queryId, sql, source: "SqlEditor", limit }),
      })
      const body = (await res.json().catch(() => null)) as {
        headers?: string[]
        data?: (string | null)[][]
        total?: number
        timeUsed?: number
        msg?: string
        message?: string
      } | null
      // An expired login: hosted Zetaris answers 401, a local install a bare 400 "Bad Request"
      // (a real SQL error always says what's wrong). Log in again, once.
      const expired =
        res.status === 401 || (res.status === 400 && (body?.msg ?? body?.message) === "Bad Request")
      if (expired && attempt === 0 && !env.ZETARIS_API_KEY) continue
      if (!res.ok) {
        throw new ZetarisError(body?.msg ?? body?.message ?? `HTTP ${res.status}`, res.status, sql)
      }
      const headers = body?.headers ?? []
      return {
        // Rows arrive as arrays with the column names in `headers`.
        rows: (body?.data ?? []).map((values) =>
          Object.fromEntries(headers.map((name, i) => [name, values[i] ?? null])),
        ),
        total: body?.total ?? body?.data?.length ?? 0,
        serverMs: body?.timeUsed ?? 0,
        wallMs: Math.round(performance.now() - started),
        queryId,
      }
    } catch (error) {
      if (controller.signal.aborted) {
        await cancel(queryId, token, org)
        throw new ZetarisError(
          `Query passed the ${timeoutMs} ms deadline and was cancelled`,
          408,
          sql,
        )
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
  throw new ZetarisError("Zetaris rejected the login token twice", 401, sql)
}

/** Quotes a value as a Spark SQL string literal. */
export const literal = (value: string) =>
  `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`

/**
 * Logs in and runs a trivial query, so the first real question doesn't pay for the session and
 * Spark's first-query warm-up (about 15 s on a fresh process; past 30 s after hours idle). Failures only log: Zetaris may be
 * starting up too, and the first real call retries the login anyway.
 */
export async function warmUp(): Promise<number> {
  const started = performance.now()
  try {
    await run("SELECT 1 AS ok", { limit: 1, timeoutMs: ZETARIS.backgroundTimeoutMs })
  } catch (error) {
    console.warn(`[zetaris] warm-up failed: ${(error as Error).message}`)
  }
  return Math.round(performance.now() - started)
}

import { randomUUID } from "node:crypto"
import { ZETARIS } from "@konkyo/config"
import { env } from "@konkyo/env/server"

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

let cachedToken: { token: string; org: string } | undefined

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
  if (cachedToken && !force) return cachedToken
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
  cachedToken = { token, org: find(body, ["orgId"]) ?? env.ZETARIS_ORG_ID ?? "1" }
  return cachedToken
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
export async function run(
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
      // An expired login token: log in again once.
      if (res.status === 401 && attempt === 0 && !env.ZETARIS_API_KEY) continue
      const body = (await res.json().catch(() => null)) as {
        headers?: string[]
        data?: (string | null)[][]
        total?: number
        timeUsed?: number
        msg?: string
        message?: string
      } | null
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

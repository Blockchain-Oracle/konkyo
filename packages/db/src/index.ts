import { DB } from "@konkyo/config"
import { env } from "@konkyo/env/server"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

// Reuse one pool across Next.js dev reloads instead of opening a new one per edit.
const globalForDb = globalThis as unknown as { konkyoSql?: postgres.Sql }

const sql = globalForDb.konkyoSql ?? postgres(env.DATABASE_URL, { max: DB.poolMax })
if (env.NODE_ENV !== "production") globalForDb.konkyoSql = sql

export const db = drizzle(sql, { schema, casing: "snake_case" })
/** The raw client, for LISTEN / NOTIFY (deep-search progress). */
export const pg = sql
export type Db = typeof db
export { schema }

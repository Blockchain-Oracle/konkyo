import { db } from "@konkyo/db"
import { sql } from "drizzle-orm"
import { NextResponse } from "next/server"

/**
 * Readiness for the platform's health check (plan S11): the app answers and its database does.
 * Zetaris and the model providers are left out on purpose: they can be slow or down without
 * this container being unable to serve pages.
 */
export async function GET() {
  try {
    await db.execute(sql`select 1`)
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } })
  } catch {
    return NextResponse.json(
      { ok: false },
      { status: 503, headers: { "cache-control": "no-store" } },
    )
  }
}

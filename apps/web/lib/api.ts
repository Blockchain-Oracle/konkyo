import "server-only"
import { NextResponse } from "next/server"
import { type ZodType, z } from "zod"
import { LibraryError } from "./library"
import { getSession } from "./session"

type Context<P> = { userId: string; request: Request; params: P }

/** Known errors become a clear message for the UI; anything else is logged and kept vague. */
function failure(error: unknown) {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: "That request wasn't valid" }, { status: 400 })
  }
  if (error instanceof LibraryError)
    return NextResponse.json({ error: error.message }, { status: error.status })
  if ((error as Error)?.name === "OutOfCreditError")
    return NextResponse.json({ error: (error as Error).message }, { status: 503 })
  console.error("[api]", error)
  return NextResponse.json({ error: "Something went wrong on our side" }, { status: 500 })
}

/**
 * Every API route: requires a session (the cookie check in proxy.ts is only optimistic), parses
 * the body with its schema, and turns known errors into a clear message for the UI.
 */
export function route<P = Record<string, never>, B = undefined>(
  fn: (ctx: Context<P> & { body: B }) => Promise<unknown>,
  bodySchema?: ZodType<B>,
) {
  return async (request: Request, ctx: { params: Promise<P> }) => {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
    try {
      const body = bodySchema ? bodySchema.parse(await request.json()) : (undefined as B)
      const result = await fn({ userId: session.user.id, request, params: await ctx.params, body })
      return NextResponse.json(result ?? { ok: true })
    } catch (error) {
      return failure(error)
    }
  }
}

/**
 * A route anyone may call (a public folder, plan F36): no session; what it serves is limited by
 * the link it's asked through.
 */
export function publicRoute<P = Record<string, never>, B = undefined>(
  fn: (ctx: Omit<Context<P>, "userId"> & { body: B }) => Promise<unknown>,
  bodySchema?: ZodType<B>,
) {
  return async (request: Request, ctx: { params: Promise<P> }) => {
    try {
      const body = bodySchema ? bodySchema.parse(await request.json()) : (undefined as B)
      const result = await fn({ request, params: await ctx.params, body })
      return NextResponse.json(result ?? { ok: true })
    } catch (error) {
      return failure(error)
    }
  }
}

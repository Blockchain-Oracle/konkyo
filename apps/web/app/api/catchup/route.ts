import { NextResponse } from "next/server"
import { catchup, markCaughtUp } from "@/lib/catchup"
import { getSession } from "@/lib/session"

/** What moved (plan F50); `?here=<spaceId>` sorts that space's lines first. */
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  const here = new URL(request.url).searchParams.get("here")
  return NextResponse.json(await catchup(session.user.id, here))
}

/** Closing catch me up: the next one starts from now. */
export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  await markCaughtUp(session.user.id)
  return NextResponse.json({ ok: true })
}

import { randomUUID } from "node:crypto"
import { db } from "@konkyo/db"
import { uuidArray } from "@konkyo/db/access"
import type { SpaceEventKind } from "@konkyo/db/schema"
import { sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { z } from "zod"
import { join, leave } from "@/lib/live-hub"
import { getMe } from "@/lib/profiles"
import { getSession } from "@/lib/session"

/** A reconnecting tab catches up on at most this many missed events (it refetches anyway). */
const REPLAY = 200

/**
 * One live stream per tab (plan §16.9): what happens in the spaces you're in (ids only; the page
 * refetches through checked routes) and who's looking at the one you're in (`?here=`). A dropped
 * connection reconnects with Last-Event-ID and replays what it missed.
 */
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  const url = new URL(request.url)
  const here = z.uuid().safeParse(url.searchParams.get("here")).data ?? null
  const last =
    Number(request.headers.get("last-event-id") ?? url.searchParams.get("after") ?? 0) || 0
  const me = await getMe(session.user.id)
  const encoder = new TextEncoder()
  const id = randomUUID()
  let closed = false
  let ping: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown, eventId?: number) => {
        if (closed) return
        try {
          controller.enqueue(
            encoder.encode(
              `${eventId ? `id: ${eventId}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          )
        } catch {
          close()
        }
      }
      const close = () => {
        if (closed) return
        closed = true
        clearInterval(ping)
        leave(id)
        try {
          controller.close()
        } catch {}
      }
      request.signal.addEventListener("abort", close)
      // Listen first, then replay: nothing that happens in between is missed.
      const spaces = await join({ id, userId: me.id, face: me.face, here, send })
      if (last && spaces.size) {
        // only what happened since they joined (a member doesn't replay the space's past)
        const missed = await db.execute<{
          id: number
          space_id: string
          kind: SpaceEventKind
          subject_id: string | null
          actor_id: string | null
        }>(sql`
          select e.id, e.space_id, e.kind, e.subject_id, e.actor_id from space_events e
          left join space_members m on m.space_id = e.space_id and m.user_id = ${me.id}
          where e.space_id = any(${uuidArray([...spaces])}::uuid[]) and e.id > ${last}
            and (m.user_id is null or e.created_at >= m.joined_at)
          order by e.id limit ${REPLAY}`)
        for (const e of missed)
          send(
            "space",
            {
              type: "event",
              spaceId: e.space_id,
              id: e.id,
              kind: e.kind,
              subjectId: e.subject_id,
              actorId: e.actor_id,
            },
            e.id,
          )
      }
      // Proxies close quiet connections; a comment every 15 s keeps this one open.
      ping = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": ping\n\n"))
      }, 15_000)
    },
    cancel() {
      closed = true
      clearInterval(ping)
      leave(id)
    },
  })
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  })
}

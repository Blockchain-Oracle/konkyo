import { pg } from "@konkyo/db"
import { NextResponse } from "next/server"
import { z } from "zod"
import { deepRunFor, eventsAfter } from "@/lib/deep"
import { LibraryError } from "@/lib/library"
import { getSession } from "@/lib/session"

const TERMINAL = new Set(["answered", "not-found", "failed", "stopped"])

/**
 * A deep run's progress as Server-Sent Events (plan F19). Every event is replayed from the one
 * after `Last-Event-ID` (the browser sends it when it reconnects), then new ones follow as the
 * worker writes them (LISTEN run_events). So a reload, a dropped connection or a second tab all
 * see the same run, from where they left it.
 */
export async function GET(request: Request, ctx: { params: Promise<{ runId: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  const runId = z.uuid().safeParse((await ctx.params).runId)
  if (!runId.success) return NextResponse.json({ error: "No such search" }, { status: 404 })
  try {
    await deepRunFor(session.user.id, runId.data)
  } catch (error) {
    if (error instanceof LibraryError)
      return NextResponse.json({ error: error.message }, { status: error.status })
    throw error
  }

  const header = request.headers.get("last-event-id")
  const param = new URL(request.url).searchParams.get("after")
  let last = Number(header ?? param ?? 0) || 0
  const encoder = new TextEncoder()
  let closed = false
  let unlisten: (() => Promise<void>) | undefined
  let ping: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const close = () => {
        if (closed) return
        closed = true
        clearInterval(ping)
        void unlisten?.()
        try {
          controller.close()
        } catch {}
      }
      request.signal.addEventListener("abort", close)
      let draining: Promise<void> = Promise.resolve()
      const drain = () => {
        draining = draining.then(async () => {
          if (closed) return
          for (const row of await eventsAfter(runId.data, last)) {
            last = row.id
            // Each event carries when it happened, so the view can show how long the run took.
            const event = { ...(row.data as object), at: row.at.toISOString() }
            controller.enqueue(encoder.encode(`id: ${row.id}\ndata: ${JSON.stringify(event)}\n\n`))
            if ((row.data as { type?: string }).type === "end") return close()
          }
        })
        return draining
      }
      // Subscribe first, then replay: nothing written in between is missed.
      const listening = await pg.listen("run_events", (payload) => {
        if (payload === runId.data) void drain()
      })
      unlisten = listening.unlisten
      await drain()
      // A run that ended before this connection has nothing more to send.
      const run = await deepRunFor(session.user.id, runId.data)
      if (TERMINAL.has(run.status)) await drain().then(close)
      // Proxies close quiet connections; a comment line every 15 s keeps this one open.
      ping = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": ping\n\n"))
      }, 15_000)
    },
    cancel() {
      closed = true
      clearInterval(ping)
      void unlisten?.()
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

import { randomUUID } from "node:crypto"
import type { AnswerEvent, KonkyoMessage, Matrix, Receipt } from "@konkyo/agents"
import { env } from "@konkyo/env/server"
import { consumeStream } from "ai"
import { NextResponse } from "next/server"
import { z } from "zod"
import { ownerOfKey } from "@/lib/api-keys"
import { type RunStatus, startAnswer } from "@/lib/ask"
import { answerLimit } from "@/lib/chats"
import { LibraryError } from "@/lib/library"

/** The same fast path as the chat: planned, written and verified in this request. */
export const maxDuration = 120

const Body = z.object({
  question: z.string().trim().min(1).max(4000),
  /** Continue a chat (its earlier turns are the context); a new chat when absent. */
  chatId: z.uuid().optional(),
  folderIds: z.array(z.uuid()).max(50).optional(),
  fileIds: z.array(z.uuid()).max(200).optional(),
})

const error = (message: string, status: number) => NextResponse.json({ error: message }, { status })

/**
 * The HTTP entry point (plan S09): ask your library from a script, with a key from Settings →
 * API keys. The question and answer land in Chats like any other.
 *
 *   curl -X POST $KONKYO_URL/api/v1/ask -H "Authorization: Bearer $KONKYO_API_KEY" \
 *     -H "content-type: application/json" -d '{"question":"How does sleep help memory?"}'
 *
 * Returns one JSON object when the answer is checked; with `Accept: application/x-ndjson`, every
 * agent step streams as a line as it happens.
 */
export async function POST(request: Request) {
  const ownerId = await ownerOfKey(request)
  if (!ownerId)
    return error("Send an API key: Authorization: Bearer kk_… (Settings → API keys)", 401)
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return error('Send JSON like {"question": "…", "folderIds": ["…"]}', 400)
  const { question, folderIds, fileIds } = parsed.data
  const limited = await answerLimit(ownerId)
  if (limited) return error(limited, 429)

  const chatId = parsed.data.chatId ?? randomUUID()
  const userMessage = {
    id: randomUUID(),
    role: "user",
    parts: [{ type: "text", text: question }],
  } as KonkyoMessage
  const streaming = request.headers.get("accept")?.includes("application/x-ndjson") ?? false

  const encoder = new TextEncoder()
  let lines: ReadableStreamDefaultController<Uint8Array> | undefined
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      lines = controller
    },
  })
  const send = (value: unknown) => {
    try {
      lines?.enqueue(encoder.encode(`${JSON.stringify(value)}\n`))
    } catch {
      // The caller left; the answer still finishes and saves.
    }
  }

  // What the single JSON reply carries, gathered from the events.
  const result: {
    final?: Extract<AnswerEvent, { type: "final" }>
    matrix?: Matrix
    receipt?: Receipt
  } = {}
  let settle: (outcome: { status: RunStatus; trace: unknown[] }) => void = () => undefined
  const ended = new Promise<{ status: RunStatus; trace: unknown[] }>((resolve) => {
    settle = resolve
  })

  let started: Awaited<ReturnType<typeof startAnswer>>
  try {
    started = await startAnswer({
      ownerId,
      chatId,
      userMessage,
      question,
      asked: question,
      scope: folderIds || fileIds ? { folderIds, fileIds } : undefined,
      tap: {
        onEvent: (event) => {
          if (event.type === "final") result.final = event
          else if (event.type === "matrix" && event.matrix.state === "done")
            result.matrix = event.matrix
          else if (event.type === "receipt") result.receipt = event.receipt
          if (streaming) send(event)
        },
        onEnd: ({ status, tracer }) => settle({ status, trace: tracer.events }),
      },
    })
  } catch (failure) {
    if (failure instanceof LibraryError) return error(failure.message, failure.status)
    throw failure
  }
  const { runId, stream } = started
  // Reading the chat stream to its end is what saves the reply and the run.
  void consumeStream({ stream })
  const url = `${env.BETTER_AUTH_URL}/chats/${chatId}`

  const summary = async () => {
    const { status, trace } = await ended
    return {
      status,
      runId,
      chatId,
      url,
      answer: result.final
        ? {
            body: result.final.body,
            caveat: result.final.caveat ?? null,
            citations: result.final.citations,
          }
        : null,
      matrix: result.matrix ?? null,
      receipt: result.receipt ?? null,
      trace,
    }
  }

  if (!streaming) return NextResponse.json(await summary())
  void summary().then((done) => {
    send({ type: "done", ...done })
    lines?.close()
  })
  return new Response(body, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-konkyo-run": runId,
      "x-konkyo-chat": chatId,
    },
  })
}

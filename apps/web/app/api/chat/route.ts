import { randomUUID } from "node:crypto"
import { answer, type KonkyoMessage, Tracer } from "@konkyo/agents"
import { consumeStream, createUIMessageStream, createUIMessageStreamResponse } from "ai"
import { NextResponse } from "next/server"
import { z } from "zod"
import {
  answerLimit,
  dropAfter,
  ensureChat,
  finishRun,
  historyFor,
  saveMessage,
  startRun,
} from "@/lib/chats"
import { LibraryError } from "@/lib/library"
import { endRun, registerRun } from "@/lib/run-registry"
import { getSession } from "@/lib/session"

/** An answer is planned, written and verified in this request (plan §3: the fast path). */
export const maxDuration = 120

const Body = z.object({
  chatId: z.uuid(),
  message: z.object({
    id: z.string().min(1).max(100),
    role: z.literal("user"),
    parts: z
      .array(z.object({ type: z.string(), text: z.string().optional() }).passthrough())
      .min(1),
  }),
  /** Regenerate: the question is asked again and its earlier answer replaced. */
  trigger: z.enum(["submit-message", "regenerate-message"]).optional(),
  /** The composer's focus for this question (Chat with file / folder, @ tags); kept on the chat. */
  scope: z
    .object({
      fileIds: z.array(z.uuid()).max(200).optional(),
      folderIds: z.array(z.uuid()).max(50).optional(),
    })
    .optional(),
})

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  const ownerId = session.user.id
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success)
    return NextResponse.json({ error: "That request wasn't valid" }, { status: 400 })
  const { chatId, scope } = parsed.data
  const userMessage = parsed.data.message as unknown as KonkyoMessage
  const question = userMessage.parts
    .flatMap((p) => (p.type === "text" ? [p.text] : []))
    .join("\n")
    .trim()
  if (!question) return NextResponse.json({ error: "Ask something first" }, { status: 400 })
  // A question asked about a selected passage carries it, so the agents know what "this" is.
  const quote = userMessage.parts.find((p) => p.type === "data-quote")
  const asked =
    quote?.type === "data-quote"
      ? `About this passage from "${quote.data.title}"${quote.data.page ? ` (page ${quote.data.page})` : ""}: “${quote.data.text}”\n\n${question}`
      : question

  const limited = await answerLimit(ownerId)
  if (limited) return NextResponse.json({ error: limited }, { status: 429 })

  let chat: Awaited<ReturnType<typeof ensureChat>>
  try {
    chat = await ensureChat(ownerId, chatId, question, scope)
  } catch (error) {
    if (error instanceof LibraryError)
      return NextResponse.json({ error: error.message }, { status: error.status })
    throw error
  }
  // Regenerate, or an edited question: what came after it is replaced by the new answer.
  await dropAfter(chatId, userMessage.id)
  const history = await historyFor(chatId, userMessage.id)
  await saveMessage(ownerId, chatId, userMessage)

  const runId = randomUUID()
  await startRun(ownerId, chatId, runId, question)
  const stopSignal = registerRun(runId, ownerId)
  let status: "answered" | "not-found" | "failed" | "stopped" = "failed"
  let receipt: unknown
  const tracer = new Tracer(runId)

  const stream = createUIMessageStream<KonkyoMessage>({
    originalMessages: [userMessage],
    execute: async ({ writer }) => {
      writer.write({
        type: "start",
        messageMetadata: { runId, createdAt: new Date().toISOString() },
      })
      let drafting = false
      const result = await answer({
        ownerId,
        question: asked,
        history,
        scope: chat.scope,
        tracer,
        // Not request.signal: leaving the page must not throw the answer away; Stop aborts.
        abortSignal: stopSignal,
        emit: (event) => {
          switch (event.type) {
            case "step":
              // One part per step, rewritten in place as it runs and finishes (F15).
              writer.write({ type: "data-step", id: `step-${event.id}`, data: event })
              break
            case "sources":
              writer.write({
                type: "data-sources",
                id: "sources",
                data: { sources: event.sources },
              })
              break
            case "text":
              if (!drafting) {
                writer.write({ type: "text-start", id: "draft" })
                drafting = true
              }
              writer.write({ type: "text-delta", id: "draft", delta: event.delta })
              break
            case "revising":
              writer.write({ type: "data-revising", id: "revising", data: event })
              break
            case "final":
              if (drafting) {
                writer.write({ type: "text-end", id: "draft" })
                drafting = false
              }
              writer.write({
                type: "data-final",
                id: "final",
                data: {
                  body: event.body,
                  caveat: event.caveat,
                  citations: event.citations,
                  rewritten: event.rewritten,
                },
              })
              break
            case "not-found":
              if (drafting) {
                writer.write({ type: "text-end", id: "draft" })
                drafting = false
              }
              writer.write({
                type: "data-notFound",
                id: "not-found",
                data: { question: event.question },
              })
              break
            case "matrix":
              writer.write({ type: "data-matrix", id: "matrix", data: event.matrix })
              break
            case "receipt":
              receipt = event.receipt
              writer.write({ type: "data-receipt", id: "receipt", data: event.receipt })
              break
          }
        },
      })
      if (drafting) writer.write({ type: "text-end", id: "draft" })
      status = result.status
    },
    onError: (error) => {
      console.error("[chat]", error)
      tracer.log({
        agent: "system",
        step: "error",
        action: "failed",
        detail: { message: (error as Error).message },
      })
      return "Something went wrong while answering. Try again."
    },
    onEnd: async ({ messages, isAborted }) => {
      endRun(runId)
      const response = messages.at(-1)
      if (response && response.role === "assistant")
        await saveMessage(ownerId, chatId, response, runId)
      await tracer.flush()
      await finishRun(runId, {
        status: isAborted || stopSignal.aborted ? "stopped" : status,
        receipt,
        events: tracer.events,
      })
    },
  })
  // A copy of the stream is drained here, so the run completes and saves even if the browser leaves.
  return createUIMessageStreamResponse({
    stream,
    consumeSseStream: ({ stream }) => consumeStream({ stream }),
  })
}

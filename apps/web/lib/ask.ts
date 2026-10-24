import "server-only"
import { randomUUID } from "node:crypto"
import { type AnswerEvent, answer, type KonkyoMessage, Tracer } from "@konkyo/agents"
import { createUIMessageStream } from "ai"
import { answerWriter } from "./answer-stream"
import { dropAfter, ensureChat, finishRun, historyFor, saveMessage, startRun } from "./chats"
import { endRun, registerRun } from "./run-registry"

export type RunStatus = "answered" | "not-found" | "failed" | "stopped"

/**
 * One question in a chat (plan §3: the fast path), shared by the app's chat and the HTTP entry
 * point: the question is saved, the answer planned, written and verified, and the reply saved
 * with its run. The returned stream must be read to the end (that is what saves the reply);
 * `tap` sees each answer event, and the outcome when it's saved.
 */
export async function startAnswer(input: {
  ownerId: string
  chatId: string
  userMessage: KonkyoMessage
  /** As typed (the chat's title); `asked` is what the agents get (with any quoted passage). */
  question: string
  asked: string
  scope?: { fileIds?: string[]; folderIds?: string[] }
  tap?: {
    onEvent?: (event: AnswerEvent) => void
    onEnd?: (outcome: { status: RunStatus; runId: string; tracer: Tracer }) => void
  }
}) {
  const { ownerId, chatId, userMessage, tap } = input
  const chat = await ensureChat(ownerId, chatId, input.question, input.scope)
  // Regenerate, or an edited question: what came after it is replaced by the new answer.
  await dropAfter(chatId, userMessage.id)
  const history = await historyFor(chatId, userMessage.id)
  await saveMessage(ownerId, chatId, userMessage)

  const runId = randomUUID()
  await startRun(ownerId, chatId, runId, input.question)
  const stopSignal = registerRun(runId, ownerId)
  let status: RunStatus = "failed"
  let receipt: unknown
  const tracer = new Tracer(runId)

  const stream = createUIMessageStream<KonkyoMessage>({
    originalMessages: [userMessage],
    execute: async ({ writer }) => {
      writer.write({
        type: "start",
        messageMetadata: { runId, createdAt: new Date().toISOString() },
      })
      const out = answerWriter(writer)
      const result = await answer({
        ownerId,
        question: input.asked,
        history,
        scope: chat.scope,
        tracer,
        // Not the request's signal: leaving the page must not throw the answer away; Stop aborts.
        abortSignal: stopSignal,
        emit: (event) => {
          out.emit(event)
          tap?.onEvent?.(event)
        },
      })
      out.endDraft()
      receipt = out.receipt()
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
      const final = isAborted || stopSignal.aborted ? "stopped" : status
      await finishRun(runId, { status: final, receipt, events: tracer.events })
      tap?.onEnd?.({ status: final, runId, tracer })
    },
  })
  return { runId, stream }
}

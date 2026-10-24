import { randomUUID } from "node:crypto"
import { answer, type KonkyoMessage, moderate, Tracer } from "@konkyo/agents"
import { PUBLIC } from "@konkyo/config"
import { consumeStream, createUIMessageStream, createUIMessageStreamResponse } from "ai"
import { NextResponse } from "next/server"
import { z } from "zod"
import { answerWriter } from "@/lib/answer-stream"
import { LibraryError } from "@/lib/library"
import {
  recordAnswerQuotes,
  recordVisitorAnswer,
  shareScope,
  visitorLimit,
  visitorOf,
} from "@/lib/shares"

export const maxDuration = 120

const Body = z.object({
  message: z.object({
    id: z.string().min(1).max(100),
    role: z.literal("user"),
    parts: z
      .array(z.object({ type: z.string(), text: z.string().max(2000).optional() }).passthrough())
      .min(1),
  }),
  /** Earlier turns from the visitor's page (nothing is stored), the last few only. */
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(6000) }))
    .max(PUBLIC.historyTurns * 2)
    .default([]),
})

/**
 * Ask a public folder (plan F36). Anyone with the link: the question is moderated, each visitor
 * and the folder have daily caps, and the answer runs the same agents and checks as the owner's,
 * over the folder's sources only, without the owner's memory.
 */
export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  let scope: Awaited<ReturnType<typeof shareScope>>
  try {
    scope = await shareScope(slug)
  } catch (error) {
    if (error instanceof LibraryError)
      return NextResponse.json({ error: error.message }, { status: error.status })
    throw error
  }
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success)
    return NextResponse.json({ error: "That request wasn't valid" }, { status: 400 })
  const userMessage = parsed.data.message as unknown as KonkyoMessage
  const question = userMessage.parts
    .flatMap((p) => (p.type === "text" ? [p.text] : []))
    .join("\n")
    .trim()
  if (!question) return NextResponse.json({ error: "Ask something first" }, { status: 400 })
  if (!scope.fileIds.size)
    return NextResponse.json({ error: "This folder has no sources yet." }, { status: 409 })

  const visitor = visitorOf(request)
  const limited = await visitorLimit(scope.folderId, visitor)
  if (limited) return NextResponse.json({ error: limited }, { status: 429 })

  const runId = `public-${randomUUID()}`
  const tracer = new Tracer(runId)
  const moderation = await moderate(question)
  tracer.log({
    agent: "system",
    step: "moderation",
    action: moderation.flagged ? "refused_question" : "checked_question",
    verdict: moderation.checked ? (moderation.flagged ? "flagged" : "ok") : "unchecked",
    detail: { categories: moderation.categories },
  })
  if (moderation.flagged) {
    await tracer.flush()
    return NextResponse.json(
      { error: "That question can't be answered here. Ask about what's in this folder." },
      { status: 422 },
    )
  }
  const answerId = await recordVisitorAnswer(scope.folderId, visitor)

  const stream = createUIMessageStream<KonkyoMessage>({
    originalMessages: [userMessage],
    execute: async ({ writer }) => {
      writer.write({
        type: "start",
        messageMetadata: { runId, createdAt: new Date().toISOString() },
      })
      const out = answerWriter(writer)
      await answer({
        ownerId: scope.ownerId,
        question,
        history: parsed.data.history,
        scope: { fileIds: [...scope.fileIds] },
        tracer,
        visitor: true,
        emit: out.emit,
      })
      out.endDraft()
      const quotes = out.receipt()?.quotes
      if (answerId && quotes) await recordAnswerQuotes(answerId, quotes)
    },
    onError: (error) => {
      console.error("[public chat]", error)
      tracer.log({
        agent: "system",
        step: "error",
        action: "failed",
        detail: { message: (error as Error).message },
      })
      return "Something went wrong while answering. Try again."
    },
    onEnd: async () => {
      await tracer.flush()
    },
  })
  return createUIMessageStreamResponse({
    stream,
    consumeSseStream: ({ stream }) => consumeStream({ stream }),
  })
}

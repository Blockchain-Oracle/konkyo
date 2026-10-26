import type { KonkyoMessage } from "@konkyo/agents"
import { consumeStream, createUIMessageStreamResponse } from "ai"
import { NextResponse } from "next/server"
import { z } from "zod"
import { startAnswer } from "@/lib/ask"
import { answerLimit } from "@/lib/chats"
import { LibraryError } from "@/lib/library"
import { getSession } from "@/lib/session"

/** An answer is planned, written and verified in this request. */
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
  /** Compare: weigh the sources against each other (the agree/disagree matrix, F13). */
  compare: z.boolean().optional(),
})

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  const ownerId = session.user.id
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success)
    return NextResponse.json({ error: "That request wasn't valid" }, { status: 400 })
  const { chatId, scope, compare } = parsed.data
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

  let started: Awaited<ReturnType<typeof startAnswer>>
  try {
    started = await startAnswer({ ownerId, chatId, userMessage, question, asked, scope, compare })
  } catch (error) {
    if (error instanceof LibraryError)
      return NextResponse.json({ error: error.message }, { status: error.status })
    throw error
  }
  const { stream } = started
  // A copy of the stream is drained here, so the run completes and saves even if the browser leaves.
  return createUIMessageStreamResponse({
    stream,
    consumeSseStream: ({ stream }) => consumeStream({ stream }),
  })
}

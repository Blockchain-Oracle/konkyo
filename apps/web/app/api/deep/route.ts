import type { KonkyoMessage } from "@konkyo/agents"
import { NextResponse } from "next/server"
import { z } from "zod"
import { startDeep } from "@/lib/deep"
import { LibraryError } from "@/lib/library"
import { getSession } from "@/lib/session"

const Body = z.object({
  chatId: z.uuid(),
  question: z.string().trim().min(1).max(2000),
  /** With Deep search on, the question itself (saved before the run's message). */
  message: z
    .object({
      id: z.string().min(1).max(100),
      role: z.literal("user"),
      parts: z.array(z.object({ type: z.string() }).passthrough()).min(1),
    })
    .optional(),
  intoFolderId: z.uuid().optional(),
  scope: z
    .object({
      fileIds: z.array(z.uuid()).max(200).optional(),
      folderIds: z.array(z.uuid()).max(50).optional(),
    })
    .optional(),
})

/** Starts a deep search in a chat; returns the message that shows its progress. */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success)
    return NextResponse.json({ error: "That request wasn't valid" }, { status: 400 })
  try {
    const { chatId, question, message, scope, intoFolderId } = parsed.data
    return NextResponse.json(
      await startDeep(session.user.id, {
        chatId,
        question,
        userMessage: message as unknown as KonkyoMessage | undefined,
        scope,
        intoFolderId,
      }),
    )
  } catch (error) {
    if (error instanceof LibraryError)
      return NextResponse.json({ error: error.message }, { status: error.status })
    throw error
  }
}

import { Skeleton } from "@konkyo/ui/components/skeleton"
import type { Metadata } from "next"
import { Suspense } from "react"
import { ChatHeader } from "@/components/chat/chat-header"
import { ChatView } from "@/components/chat/chat-view"
import { getChat } from "@/lib/chats"
import { getSession } from "@/lib/session"

export const metadata: Metadata = { title: "Chat" }

async function Chat({ params }: { params: PageProps<"/chats/[id]">["params"] }) {
  const { id } = await params
  const session = await getSession()
  const found = session ? await getChat(session.user.id, id) : null
  // A new chat (its first question was just asked) has no rows yet: it opens empty.
  return (
    <ChatView
      id={id}
      initialMessages={found?.messages ?? []}
      scope={found?.chat.scope}
      header={
        <ChatHeader
          id={id}
          initial={
            found
              ? {
                  id,
                  title: found.chat.title,
                  pinnedAt: found.chat.pinnedAt?.toISOString() ?? null,
                }
              : undefined
          }
        />
      }
    />
  )
}

function ChatSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pt-4 md:px-8 md:pt-[92px]" aria-hidden>
      <Skeleton className="h-8 w-24 rounded-full" />
      <Skeleton className="mt-3 h-12 w-3/5" />
      <div className="surface-paper paper-sheet mt-7 space-y-6">
        <Skeleton className="ml-auto h-11 w-2/3 rounded-2xl" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-2/5" />
      </div>
    </div>
  )
}

/** The chat id is URL data: it is read inside the boundary, so navigation stays instant. */
export default function ChatPage({ params }: PageProps<"/chats/[id]">) {
  return (
    <Suspense fallback={<ChatSkeleton />}>
      <Chat params={params} />
    </Suspense>
  )
}

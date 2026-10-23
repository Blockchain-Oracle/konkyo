import { Skeleton } from "@konkyo/ui/components/skeleton"
import type { Metadata } from "next"
import { Suspense } from "react"
import { ChatView } from "@/components/chat/chat-view"
import { MobileHeader } from "@/components/page-header"
import { getChat } from "@/lib/chats"
import { getSession } from "@/lib/session"

export const metadata: Metadata = { title: "Chat" }

async function Chat({ params }: { params: PageProps<"/chats/[id]">["params"] }) {
  const { id } = await params
  const session = await getSession()
  const found = session ? await getChat(session.user.id, id) : null
  // A new chat (its first question was just asked) has no rows yet: it opens empty.
  return (
    <>
      <MobileHeader title={found?.chat.title ?? "New chat"} />
      <ChatView id={id} initialMessages={found?.messages ?? []} scope={found?.chat.scope} />
    </>
  )
}

function ChatSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[46rem] space-y-6 px-6 pt-12" aria-hidden>
      <Skeleton className="ml-auto h-11 w-2/3 rounded-2xl" />
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-4 w-2/5" />
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

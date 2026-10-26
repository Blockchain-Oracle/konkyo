"use client"

import { PlusIcon } from "lucide-react"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { sound } from "@/lib/sounds"

/**
 * Start a chat from the page that lists them: a fresh id opens an empty chat (it has no rows
 * until its first question), looking at the whole library, with questions to start from.
 */
export function NewChatButton() {
  const router = useRouter()
  return (
    <button
      type="button"
      className="claim-done"
      onClick={() => {
        sound("tap")
        router.push(`/chats/${crypto.randomUUID()}` as Route)
      }}
    >
      <PlusIcon className="size-4" strokeWidth={2.5} aria-hidden />
      new chat
    </button>
  )
}

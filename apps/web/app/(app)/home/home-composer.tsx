"use client"

import type { Route } from "next"
import { useRouter } from "next/navigation"
import { Composer } from "@/components/composer"
import { holdQuestion } from "@/lib/pending-question"

/** Home's question box: a question starts a new chat, which sends it as soon as it opens. */
export function HomeComposer() {
  const router = useRouter()
  return (
    <Composer
      className="mt-9"
      onSubmit={({ text, deep, quote }) => {
        const chatId = crypto.randomUUID()
        holdQuestion(chatId, { text, deep, quote })
        router.push(`/chats/${chatId}` as Route)
      }}
    />
  )
}

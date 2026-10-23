"use client"

import type { Route } from "next"
import { useRouter } from "next/navigation"
import { Composer } from "@/components/composer"

export function HomeComposer() {
  const router = useRouter()
  return (
    <Composer
      className="mt-9"
      onSubmit={({ text, deep }) => {
        const params = new URLSearchParams({ q: text })
        if (deep) params.set("deep", "1")
        // A new chat starts from the question (the chat route arrives with S04).
        router.push(`/chats/new?${params}` as Route)
      }}
    />
  )
}

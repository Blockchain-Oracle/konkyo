"use client"

import { Button } from "@konkyo/ui/components/button"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Composer, type ComposerSubmit } from "@/components/composer"
import { type Focus, WHOLE_LIBRARY } from "@/lib/focus"
import { holdQuestion } from "@/lib/pending-question"
import { useFiles } from "@/lib/use-library"

/**
 * Home's question box: a question starts a new chat, which sends it as soon as it
 * opens, with whatever focus was chosen here. "A file" and "a folder" open the composer's focus
 * list, so you pick what to ask about first.
 */
export function HomeComposer() {
  const router = useRouter()
  const { data: files } = useFiles()
  const [focus, setFocus] = useState<Focus>(WHOLE_LIBRARY)
  const [picking, setPicking] = useState(false)
  const hasReady = files?.some((f) => f.status === "ready") ?? false

  const ask = ({
    text,
    deep,
    compare,
    quote,
  }: Pick<ComposerSubmit, "text"> & Partial<ComposerSubmit>) => {
    const chatId = crypto.randomUUID()
    holdQuestion(chatId, { text, deep, compare, quote, focus })
    router.push(`/chats/${chatId}` as Route)
  }

  return (
    <>
      <Composer
        className="mt-6"
        onSubmit={ask}
        focus={focus}
        onFocusChange={setFocus}
        picking={picking}
        onPickingChange={setPicking}
      />
      {hasReady && (
        <nav aria-label="Ask about" className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-semibold text-ink-muted">or ask about</span>
          <Button variant="outline" size="sm" onClick={() => setPicking(true)}>
            one file
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPicking(true)}>
            one folder
          </Button>
        </nav>
      )}
    </>
  )
}

"use client"

import { Button } from "@konkyo/ui/components/button"
import { FileTextIcon, FolderIcon, UploadIcon } from "lucide-react"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { SuggestedQuestions } from "@/components/chat/suggested-questions"
import { Composer, type ComposerSubmit } from "@/components/composer"
import { useUploads } from "@/components/library/uploads-provider"
import { type Focus, WHOLE_LIBRARY } from "@/lib/focus"
import { holdQuestion } from "@/lib/pending-question"
import { useFiles } from "@/lib/use-library"

/**
 * Home's question box (plan F40): a question starts a new chat, which sends it as soon as it
 * opens, with whatever focus was chosen here. Below it, quick actions, today's review (the
 * children) and questions the library can answer.
 */
export function HomeComposer({ children }: { children?: React.ReactNode }) {
  const router = useRouter()
  const { pickFiles } = useUploads()
  const { data: files } = useFiles()
  const [focus, setFocus] = useState<Focus>(WHOLE_LIBRARY)
  const [picking, setPicking] = useState(false)
  const hasReady = files?.some((f) => f.status === "ready") ?? false

  const ask = ({ text, deep, quote }: Pick<ComposerSubmit, "text"> & Partial<ComposerSubmit>) => {
    const chatId = crypto.randomUUID()
    holdQuestion(chatId, { text, deep, quote, focus })
    router.push(`/chats/${chatId}` as Route)
  }

  return (
    <>
      <Composer
        className="mt-9"
        onSubmit={ask}
        focus={focus}
        onFocusChange={setFocus}
        picking={picking}
        onPickingChange={setPicking}
      />
      <nav aria-label="Quick actions" className="mt-4.5 flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 text-snippet text-silver-mist"
          onClick={() => pickFiles()}
        >
          <UploadIcon strokeWidth={1.5} />
          Upload
        </Button>
        {/* Both open the composer's focus list: pick a file or a folder, then ask. */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 text-snippet text-silver-mist"
          onClick={() => setPicking(true)}
          disabled={!hasReady}
        >
          <FileTextIcon strokeWidth={1.5} />
          Chat with a file
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 text-snippet text-silver-mist"
          onClick={() => setPicking(true)}
          disabled={!hasReady}
        >
          <FolderIcon strokeWidth={1.5} />
          Chat with a folder
        </Button>
      </nav>
      {children}
      <div className="mt-15">
        <SuggestedQuestions focus={focus} onAsk={(text) => ask({ text })} enabled={hasReady} />
      </div>
    </>
  )
}

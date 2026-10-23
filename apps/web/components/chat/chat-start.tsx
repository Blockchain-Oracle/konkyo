"use client"

import { type Focus, isWholeLibrary, useFocusItems } from "@/lib/focus"
import { SuggestedQuestions } from "./suggested-questions"

/**
 * A chat before its first question (plan F10, F16): what it looks at, and questions those files
 * can answer. Opened from a file or folder, it is already focused there.
 */
export function ChatStart({ focus, onAsk }: { focus: Focus; onAsk: (question: string) => void }) {
  const items = useFocusItems()
  const whole = isWholeLibrary(focus)
  const names = [
    ...focus.folderIds.map((id) => items.find((i) => i.type === "folder" && i.id === id)?.name),
    ...focus.fileIds.map((id) => items.find((i) => i.type === "file" && i.id === id)?.name),
  ].filter(Boolean) as string[]
  const title = whole
    ? "Ask anything in your library"
    : names.length === 1
      ? `Ask about ${names[0]}`
      : `Ask about these ${names.length || ""} sources`.replace("  ", " ")
  return (
    <div className="pt-6">
      <p className="text-micro text-saffron-spark uppercase">
        {whole ? "Your library" : "In focus"}
      </p>
      <h2 className="mt-3 text-subheading font-normal text-bone-white">{title}</h2>
      <p className="mt-2 max-w-xl text-snippet text-ash-gray">
        {whole
          ? "Answers come only from your files, and every quote is checked against its source in Zetaris."
          : "Answers come only from what's in focus, and every quote is checked against its source in Zetaris. Change the focus below, or type @ to add a file."}
      </p>
      <div className="mt-9">
        <SuggestedQuestions focus={focus} onAsk={onAsk} />
      </div>
    </div>
  )
}

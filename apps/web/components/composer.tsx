"use client"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@konkyo/ui/components/input-group"
import { cn } from "@konkyo/ui/lib/utils"
import { ArrowUpIcon, LibraryBigIcon, PlusIcon, TelescopeIcon, XIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { type QuotedPassage, quoteInComposer, useComposerQuote } from "@/lib/composer-draft"

export type ComposerSubmit = { text: string; deep: boolean; quote?: QuotedPassage }

/**
 * The chat box (AI Elements' Prompt Input pattern: input group + attachments + menus).
 * A plain chat sees the whole library; `@` focus arrives with chat in S04.
 */
export function Composer({
  onSubmit,
  placeholder = "Ask your library…",
  className,
}: {
  onSubmit: (value: ComposerSubmit) => void
  placeholder?: string
  className?: string
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState("")
  const [deep, setDeep] = useState(false)
  const quote = useComposerQuote()
  const canSend = text.trim().length > 0

  // A passage sent here with "Ask" waits above the input, and the cursor is ready for the question.
  useEffect(() => {
    if (quote) inputRef.current?.focus()
  }, [quote])

  return (
    <form
      ref={formRef}
      className={className}
      onSubmit={(event) => {
        event.preventDefault()
        if (canSend) onSubmit({ text: text.trim(), deep, quote: quote ?? undefined })
      }}
    >
      <InputGroup className="rounded-card border-input bg-panel has-[[data-slot=input-group-control]:focus-visible]:border-line-strong has-[[data-slot=input-group-control]:focus-visible]:ring-0 dark:bg-panel">
        {quote && (
          <InputGroupAddon align="block-start" className="px-3 pt-3">
            <figure className="flex w-full items-start gap-2 rounded-xl bg-raised py-2.5 pr-1.5 pl-3">
              <div className="min-w-0 flex-1">
                <blockquote className="line-clamp-2 text-snippet text-silver-mist">
                  “{quote.text}”
                </blockquote>
                <figcaption className="mt-1 truncate text-meta text-ash-gray">
                  {quote.title}
                  {quote.page ? ` · p. ${quote.page}` : ""}
                </figcaption>
              </div>
              <button
                type="button"
                aria-label="Remove the quote"
                onClick={() => quoteInComposer(null)}
                className="grid size-6 shrink-0 place-items-center rounded-full text-ash-gray hover:bg-white/8 hover:text-bone-white"
              >
                <XIcon className="size-3.5" strokeWidth={1.75} />
              </button>
            </figure>
          </InputGroupAddon>
        )}
        <InputGroupTextarea
          ref={inputRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter is a new line; never send mid-IME composition.
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              formRef.current?.requestSubmit()
            }
          }}
          placeholder={quote ? "Ask about this passage…" : placeholder}
          aria-label="Message"
          rows={2}
          className="max-h-[40vh] min-h-16 px-4.5 pt-4 text-reading placeholder:text-ash-gray"
        />
        <InputGroupAddon align="block-end" className="gap-1.5 px-3 pb-3">
          <InputGroupButton
            size="icon-sm"
            variant="outline"
            className="rounded-full"
            aria-label="Attach files"
          >
            <PlusIcon strokeWidth={1.5} />
          </InputGroupButton>
          {/* Phones show the icon only, so the send button never leaves the row. */}
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full px-2 text-snippet whitespace-nowrap text-ash-gray sm:px-2.5">
            <LibraryBigIcon className="size-3.5" strokeWidth={1.5} aria-hidden />
            <span className="sr-only sm:not-sr-only">Whole library</span>
          </span>
          <InputGroupButton
            size="sm"
            variant="ghost"
            aria-pressed={deep}
            onClick={() => setDeep((value) => !value)}
            className={cn(
              "h-8 rounded-full px-2.5 text-snippet whitespace-nowrap text-ash-gray",
              deep && "bg-raised text-bone-white",
            )}
          >
            <TelescopeIcon className="size-3.5" strokeWidth={1.5} />
            Deep search
          </InputGroupButton>
          {/* Violet only while there's text, so a view never shows two violet actions (§7.4 #9). */}
          <InputGroupButton
            type="submit"
            size="icon-sm"
            variant={canSend ? "default" : "secondary"}
            disabled={!canSend}
            className="ml-auto rounded-full"
            aria-label="Send"
          >
            <ArrowUpIcon strokeWidth={2} />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}

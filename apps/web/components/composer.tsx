"use client"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@konkyo/ui/components/input-group"
import { cn } from "@konkyo/ui/lib/utils"
import {
  ArrowUpIcon,
  AtSignIcon,
  LibraryBigIcon,
  PlusIcon,
  ScaleIcon,
  SquareIcon,
  TelescopeIcon,
  XIcon,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { FocusIcon, FocusPicker, MentionList, mentionMatches } from "@/components/chat/focus-picker"
import {
  type QuotedPassage,
  quoteInComposer,
  useComposerPresence,
  useComposerQuote,
} from "@/lib/composer-draft"
import {
  type Focus,
  type FocusItem,
  isWholeLibrary,
  toggleFocus,
  useFocusItems,
  WHOLE_LIBRARY,
} from "@/lib/focus"
import { isSendKey } from "@/lib/keys"
import { useFiles } from "@/lib/use-library"
import { useUploads } from "./library/uploads-provider"

export type ComposerSubmit = {
  text: string
  deep: boolean
  /** Weigh the sources against each other: the answer comes with the agree/disagree matrix. */
  compare: boolean
  quote?: QuotedPassage
}

/** An `@` being typed: where it starts and what follows it, up to the caret. */
type Mention = { start: number; end: number; query: string }

function mentionAt(text: string, caret: number): Mention | null {
  const match = text.slice(0, caret).match(/(^|\s)@([^\s@]{0,40})$/)
  if (!match) return null
  const query = match[2] ?? ""
  return { start: caret - query.length - 1, end: caret, query }
}

/**
 * The chat box (AI Elements' Prompt Input pattern: input group + attachments + menus). It sees
 * the whole library unless it has a focus (plan F10): files and folders chosen from the focus
 * pill or with `@`, shown as chips above the text.
 */
export function Composer({
  onSubmit,
  placeholder = "Ask your library…",
  className,
  running = false,
  onStop,
  focus = WHOLE_LIBRARY,
  onFocusChange,
  picking: pickingProp,
  onPickingChange,
}: {
  onSubmit: (value: ComposerSubmit) => void
  placeholder?: string
  className?: string
  /** An answer is being written: the send button becomes Stop (plan F15). */
  running?: boolean
  onStop?: () => void
  focus?: Focus
  /** Without it the composer always asks the whole library. */
  onFocusChange?: (focus: Focus) => void
  /** The focus picker, opened from outside (Home's "Chat with a file"). */
  picking?: boolean
  onPickingChange?: (open: boolean) => void
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState("")
  const [deep, setDeep] = useState(false)
  const [compare, setCompare] = useState(false)
  const [mention, setMention] = useState<Mention | null>(null)
  const [active, setActive] = useState(0)
  const [pickingState, setPickingState] = useState(false)
  const picking = pickingProp ?? pickingState
  const setPicking = onPickingChange ?? setPickingState
  const quote = useComposerQuote()
  useComposerPresence()
  const { pickFiles } = useUploads()
  const { data: libraryFiles } = useFiles()
  // Files attached with + (or picked) that are still being read: the question waits for them.
  const reading = (libraryFiles ?? []).filter(
    (f) => focus.fileIds.includes(f.id) && (f.status === "queued" || f.status === "processing"),
  ).length
  const focusRef = useRef(focus)
  focusRef.current = focus
  const attach = () =>
    pickFiles(undefined, (ids) => {
      if (!ids.length || !onFocusChange) return
      const now = focusRef.current
      onFocusChange({ ...now, fileIds: [...new Set([...now.fileIds, ...ids])] })
    })
  const canSend = text.trim().length > 0 && reading === 0
  // Names resolve after mount: the server renders before the library list exists, so both
  // render the same placeholder chips first.
  const loaded = useFocusItems()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const items = mounted ? loaded : []
  const matches = useMemo(
    () => (mention ? mentionMatches(items, mention.query) : []),
    [items, mention],
  )
  const chosen = useMemo(
    () => [
      ...focus.folderIds.map(
        (id) =>
          items.find((i) => i.type === "folder" && i.id === id) ??
          ({ type: "folder", id, name: "" } as FocusItem),
      ),
      ...focus.fileIds.map((id) => {
        const pickable = items.find((i) => i.type === "file" && i.id === id)
        if (pickable) return pickable
        // Attached and still being read: not pickable yet, but named.
        const attached = mounted ? libraryFiles?.find((f) => f.id === id) : undefined
        return attached
          ? ({ type: "file", id, name: attached.title, kind: attached.kind } as FocusItem)
          : ({ type: "folder", id, name: "" } as FocusItem)
      }),
    ],
    [focus, items, libraryFiles, mounted],
  )

  // `@name` becomes a chip: the typed mention leaves the text and joins the focus.
  const pick = (item: FocusItem) => {
    if (!mention || !onFocusChange) return
    const next = `${text.slice(0, mention.start)}${text.slice(mention.end)}`
    setText(next)
    setMention(null)
    const inFocus = (item.type === "file" ? focus.fileIds : focus.folderIds).includes(item.id)
    if (!inFocus) onFocusChange(toggleFocus(focus, item))
    requestAnimationFrame(() => inputRef.current?.setSelectionRange(mention.start, mention.start))
  }

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
        if (!canSend || running) return
        onSubmit({ text: text.trim(), deep, compare, quote: quote ?? undefined })
        setText("")
        quoteInComposer(null)
      }}
    >
      <InputGroup className="relative rounded-card border-input bg-panel has-[[data-slot=input-group-control]:focus-visible]:border-line-strong has-[[data-slot=input-group-control]:focus-visible]:ring-0 dark:bg-panel">
        {mention && onFocusChange && (
          <MentionList matches={matches} active={active} onPick={pick} />
        )}
        {chosen.length > 0 && (
          <InputGroupAddon align="block-start" className="flex-wrap gap-1.5 px-3 pt-3">
            {chosen.map((item) => (
              <span
                key={`${item.type}:${item.id}`}
                className="inline-flex h-7 max-w-64 items-center gap-1.5 rounded-full bg-raised pr-1 pl-2.5 text-snippet text-silver-mist"
              >
                <FocusIcon item={item} />
                {item.name ? (
                  <span className="truncate">{item.name}</span>
                ) : (
                  <span className="h-3 w-20 animate-pulse rounded bg-white/10" aria-hidden />
                )}
                {onFocusChange && (
                  <button
                    type="button"
                    aria-label={`Stop focusing on ${item.name}`}
                    onClick={() => onFocusChange(toggleFocus(focus, item))}
                    className="grid size-5 shrink-0 place-items-center rounded-full text-ash-gray hover:bg-white/8 hover:text-bone-white"
                  >
                    <XIcon className="size-3" strokeWidth={1.75} />
                  </button>
                )}
              </span>
            ))}
          </InputGroupAddon>
        )}
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
          onChange={(event) => {
            setText(event.target.value)
            const next = mentionAt(event.target.value, event.target.selectionStart)
            setMention(next)
            if (!next || next.query !== mention?.query) setActive(0)
          }}
          onBlur={() => setMention(null)}
          onKeyDown={(event) => {
            if (mention && onFocusChange) {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault()
                const step = event.key === "ArrowDown" ? 1 : -1
                setActive((i) =>
                  matches.length ? (i + step + matches.length) % matches.length : 0,
                )
                return
              }
              if ((event.key === "Enter" || event.key === "Tab") && matches[active]) {
                event.preventDefault()
                pick(matches[active])
                return
              }
              if (event.key === "Escape") {
                event.preventDefault()
                setMention(null)
                return
              }
            }
            if (isSendKey(event)) {
              event.preventDefault()
              formRef.current?.requestSubmit()
            }
          }}
          placeholder={
            quote
              ? "Ask about this passage…"
              : chosen.length
                ? `Ask about ${chosen.length === 1 ? chosen[0]?.name || "this" : `these ${chosen.length}`}…`
                : placeholder
          }
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
            onClick={attach}
          >
            <PlusIcon strokeWidth={1.5} />
          </InputGroupButton>
          {/* Phones show the icon only, so the send button never leaves the row. */}
          {onFocusChange ? (
            <FocusPicker
              items={items}
              focus={focus}
              onChange={onFocusChange}
              open={picking}
              onOpenChange={setPicking}
              trigger={
                <InputGroupButton
                  size="sm"
                  variant="ghost"
                  className="h-8 rounded-full px-2 text-snippet whitespace-nowrap text-ash-gray sm:px-2.5"
                  aria-label={
                    isWholeLibrary(focus) ? "Whole library (choose a focus)" : "Change the focus"
                  }
                >
                  {isWholeLibrary(focus) ? (
                    <LibraryBigIcon className="size-3.5" strokeWidth={1.5} aria-hidden />
                  ) : (
                    <AtSignIcon className="size-3.5" strokeWidth={1.5} aria-hidden />
                  )}
                  <span className="sr-only sm:not-sr-only">
                    {isWholeLibrary(focus) ? "Whole library" : "Focus"}
                  </span>
                </InputGroupButton>
              }
            />
          ) : (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full px-2 text-snippet whitespace-nowrap text-ash-gray sm:px-2.5">
              <LibraryBigIcon className="size-3.5" strokeWidth={1.5} aria-hidden />
              <span className="sr-only sm:not-sr-only">Whole library</span>
            </span>
          )}
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
          <InputGroupButton
            size="sm"
            variant="ghost"
            aria-pressed={compare}
            onClick={() => setCompare((value) => !value)}
            title="Where your sources agree and disagree, claim by claim"
            className={cn(
              "h-8 rounded-full px-2.5 text-snippet whitespace-nowrap text-ash-gray",
              compare && "bg-raised text-bone-white",
            )}
          >
            <ScaleIcon className="size-3.5" strokeWidth={1.5} />
            Compare
          </InputGroupButton>
          {reading > 0 && (
            <span className="ml-auto text-[12px] font-semibold text-ash-gray" aria-live="polite">
              reading {reading} file{reading === 1 ? "" : "s"}…
            </span>
          )}
          {/* Violet only while there's text, so a view never shows two violet actions (§7.4 #9). */}
          {running ? (
            <InputGroupButton
              type="button"
              size="icon-sm"
              variant="secondary"
              onClick={onStop}
              className="ml-auto rounded-full"
              aria-label="Stop"
            >
              <SquareIcon className="size-3 fill-current" strokeWidth={0} />
            </InputGroupButton>
          ) : (
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
          )}
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}

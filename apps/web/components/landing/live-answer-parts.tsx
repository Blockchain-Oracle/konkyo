"use client"

import { Button } from "@konkyo/ui/components/button"
import { ArrowUpIcon, SquareIcon } from "lucide-react"
import Link from "next/link"
import type { PublicShare } from "@/components/public/public-folder"

/** Questions these three papers answer (each checked against them on testing). */
export const SUGGESTED = [
  "Does a daytime nap help motor learning?",
  "What role do sleep spindles play in memory?",
  "Does sleep help memory the same way in older adults?",
]

/**
 * The live demo's header, box and suggestions: the same markup before and after the chat code
 * loads (live-answer-lazy.tsx), so nothing moves when it arrives.
 */
export function AskForm({
  slug,
  share,
  text,
  onText,
  onAsk,
  onFocus,
  running = false,
  onStop,
}: {
  slug: string
  share: PublicShare
  text: string
  onText: (text: string) => void
  onAsk: (question: string) => void
  onFocus?: () => void
  running?: boolean
  onStop?: () => void
}) {
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-display text-[22px] leading-tight font-extrabold tracking-[-0.03em] lowercase">
          {share.name}
        </p>
        <Link
          href={`/s/${slug}`}
          className="text-meta text-ash-gray underline-offset-4 hover:text-ink hover:underline"
        >
          {share.files.length} open-access papers · open the space ↗
        </Link>
      </div>

      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault()
          onAsk(text)
        }}
      >
        <div className="relative rounded-full border-2 border-ink/15 bg-white focus-within:border-ink">
          <input
            value={text}
            onChange={(e) => onText(e.target.value)}
            onFocus={onFocus}
            placeholder="Ask these papers anything…"
            aria-label="Your question"
            maxLength={500}
            className="h-13 w-full rounded-full bg-transparent pr-14 pl-5 text-reading text-ink outline-none placeholder:text-ash-gray"
          />
          {running ? (
            <Button
              type="button"
              size="icon-sm"
              variant="secondary"
              onClick={onStop}
              className="absolute top-2.5 right-3"
              aria-label="Stop"
            >
              <SquareIcon className="size-3 fill-current" strokeWidth={0} />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon-sm"
              variant={text.trim() ? "default" : "secondary"}
              disabled={!text.trim()}
              className="absolute top-2.5 right-3"
              aria-label="Ask"
            >
              <ArrowUpIcon strokeWidth={2} />
            </Button>
          )}
        </div>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTED.map((s) => (
          <button
            key={s}
            type="button"
            disabled={running}
            onClick={() => onAsk(s)}
            className="rounded-full border border-ink/15 bg-white px-3.5 py-1.5 text-snippet font-medium text-ink transition-colors duration-(--duration-press) hover:border-ink disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
    </>
  )
}

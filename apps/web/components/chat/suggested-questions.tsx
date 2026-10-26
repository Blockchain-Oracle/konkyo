"use client"

import { Skeleton } from "@konkyo/ui/components/skeleton"
import { CornerDownRightIcon } from "lucide-react"
import type { Focus } from "@/lib/focus"
import { useSuggestions } from "@/lib/use-suggestions"

/**
 * Questions worth asking of what's in focus, written from the files' own contents.
 * One click asks it; nothing shows when there's nothing to suggest.
 */
export function SuggestedQuestions({
  focus,
  onAsk,
  label = "Try asking",
  enabled = true,
}: {
  focus: Focus
  onAsk: (question: string) => void
  label?: string
  enabled?: boolean
}) {
  const { data: questions, isPending, isError } = useSuggestions(focus, enabled)
  if (!enabled || isError || (!isPending && !questions?.length)) return null
  return (
    <section aria-label={label}>
      <h2 className="text-micro text-saffron-spark uppercase">{label}</h2>
      <ul className="mt-3 divide-y divide-border border-y border-border">
        {isPending
          ? Array.from({ length: 3 }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
              <li key={i} className="flex h-11 items-center gap-3 px-1">
                <Skeleton className="h-3.5 w-3.5 rounded" />
                <Skeleton className="h-3.5" style={{ width: `${55 + i * 12}%` }} />
              </li>
            ))
          : questions?.map((q) => (
              <li key={q}>
                <button
                  type="button"
                  onClick={() => onAsk(q)}
                  className="group flex min-h-11 w-full items-center gap-3 px-1 py-2.5 text-left text-ui text-silver-mist transition-colors duration-(--duration-press) hover:text-bone-white"
                >
                  <CornerDownRightIcon
                    className="size-3.5 shrink-0 text-ash-gray group-hover:text-bone-white"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  {q}
                </button>
              </li>
            ))}
      </ul>
    </section>
  )
}

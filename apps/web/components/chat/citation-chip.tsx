"use client"

import type { Citation } from "@konkyo/agents"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@konkyo/ui/components/hover-card"
import { cn } from "@konkyo/ui/lib/utils"
import { ArrowUpRightIcon } from "lucide-react"
import { createContext, useContext } from "react"
import { KindIcon } from "@/components/library/kind-icon"
import { openSource } from "@/lib/preview"

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`
export const whereIs = (c: { page: number | null; tStart: number | null }) =>
  c.page != null ? `p. ${c.page}` : c.tStart != null ? clock(c.tStart) : ""

/** The answer a chip belongs to, so the passage it opens can ask "Right passage?". */
export const CitedIn = createContext<string | null>(null)

/** Lights a source on the chat's wall while its chip is pointed at (OurSpaces' cited ring). */
export const LitSource = createContext<((fileId: string | null) => void) | null>(null)

/** The verified tick, drawn in once (plan §7.4 #1). */
function Tick({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden className={cn("size-2.5", className)}>
      <path
        d="M2.5 6.4 5 8.7 9.5 3.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="12"
        className="animate-tick"
      />
    </svg>
  )
}

/**
 * A numbered citation (plan F11): "checking" while the Verifier works (amber outline, pulsing in
 * place), then verified (verdant tick). Hover shows the source and the exact quote; a click
 * opens the passage in the source pane, highlighted.
 */
export function CitationChip({ n, citation }: { n: number; citation?: Citation }) {
  const messageId = useContext(CitedIn)
  const light = useContext(LitSource)
  if (!citation) {
    return (
      <span
        role="img"
        aria-label={`Citation ${n}, being checked`}
        className="mx-0.5 inline-flex h-[1.3em] min-w-[1.5em] translate-y-[-0.08em] animate-checking items-center justify-center rounded-[6px] border border-partly/70 px-1 align-middle text-[0.72em] text-partly tabular-nums"
      >
        {n}
      </span>
    )
  }
  const open = () =>
    openSource({
      fileId: citation.fileId,
      title: citation.title,
      kind: citation.kind as Parameters<typeof openSource>[0]["kind"],
      passageId: citation.passageId,
      quote: citation.quote,
      cited: messageId ? { messageId, n } : undefined,
    })
  return (
    <HoverCard>
      <HoverCardTrigger
        delay={300}
        render={
          <button
            type="button"
            onClick={open}
            onPointerEnter={() => light?.(citation.fileId)}
            onPointerLeave={() => light?.(null)}
            onFocus={() => light?.(citation.fileId)}
            onBlur={() => light?.(null)}
            aria-label={`Citation ${n}: ${citation.title}${whereIs(citation) ? `, ${whereIs(citation)}` : ""}. Verified.`}
            className="mx-0.5 inline-flex h-[1.35em] min-w-[1.6em] translate-y-[-0.08em] items-center justify-center gap-0.5 rounded-[7px] border border-border bg-raised px-1 align-middle text-[0.72em] font-bold text-silver-mist tabular-nums transition-colors duration-(--duration-press) hover:border-transparent hover:bg-lime hover:text-ink focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        }
      >
        {n}
        <Tick className="text-supports" />
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-80 p-0">
        <div className="flex items-start gap-2.5 border-b border-border p-3">
          <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-raised">
            <KindIcon
              kind={citation.kind as Parameters<typeof KindIcon>[0]["kind"]}
              className="size-3.5"
            />
          </span>
          <div className="min-w-0">
            <p className="line-clamp-2 text-snippet text-bone-white">{citation.title}</p>
            <p className="mt-0.5 text-meta text-ash-gray">
              {[citation.byline, whereIs(citation)].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <blockquote className="mx-3 mt-3 border-l-2 border-partly/70 pl-3 text-snippet leading-relaxed text-silver-mist">
          “{citation.quote}”
        </blockquote>
        <div className="flex items-center justify-between p-3">
          <span className="inline-flex items-center gap-1 text-meta text-supports-text">
            <Tick className="text-supports" />
            {citation.state === "rewritten" ? "Verified after a rewrite" : "Found in Zetaris"}
          </span>
          <button
            type="button"
            onClick={open}
            className="inline-flex items-center gap-1 text-meta text-ash-gray hover:text-bone-white"
          >
            Open in source
            <ArrowUpRightIcon className="size-3" strokeWidth={1.75} />
          </button>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

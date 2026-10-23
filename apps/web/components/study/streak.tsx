"use client"

import { weekdayInitial } from "@konkyo/study"
import { Tooltip, TooltipContent, TooltipTrigger } from "@konkyo/ui/components/tooltip"
import { cn } from "@konkyo/ui/lib/utils"
import { FlameIcon, SnowflakeIcon } from "lucide-react"
import type { StreakView } from "@/lib/study"

/** The streak count and the freezes held (plan F31). */
export function StreakPill({ streak, className }: { streak: StreakView; className?: string }) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border border-border px-2.5 text-snippet tabular-nums",
                streak.doneToday ? "text-bone-white" : "text-silver-mist",
              )}
            />
          }
        >
          <FlameIcon
            className={cn(
              "size-3.5",
              streak.doneToday ? "fill-saffron-spark text-saffron-spark" : "text-ash-gray",
            )}
            strokeWidth={1.5}
            aria-hidden
          />
          {streak.current}
          <span className="sr-only">-day streak</span>
        </TooltipTrigger>
        <TooltipContent>
          {streak.current
            ? `${streak.current}-day streak${streak.doneToday ? "" : " · a round today keeps it"}`
            : "Finish a round to start a streak"}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-flex h-7 items-center gap-1 rounded-full border border-border px-2.5 text-snippet text-silver-mist tabular-nums" />
          }
        >
          <SnowflakeIcon className="size-3.5 text-ash-gray" strokeWidth={1.5} aria-hidden />
          {streak.freezes}
          <span className="sr-only">freezes</span>
        </TooltipTrigger>
        <TooltipContent>
          {streak.freezes === 1 ? "1 freeze" : `${streak.freezes} freezes`}: a missed day is covered
          automatically. One comes back every 7 days.
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

/** A triangle, the brand's particle: filled for a studied day, outlined for today still open. */
function Mark({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg viewBox="-6 -6 12 12" className={cn("size-3.5", className)} aria-hidden>
      <polygon
        points="0,-5 4.33,2.5 -4.33,2.5"
        className={cn(filled ? "fill-current" : "fill-none")}
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** The last seven days. A missed day is just empty: the break is never highlighted. */
export function WeekStrip({ week, className }: { week: StreakView["week"]; className?: string }) {
  return (
    <ol className={cn("flex items-end gap-2.5", className)} aria-label="The last seven days">
      {week.map((d) => {
        const label =
          d.kind === "done"
            ? "studied"
            : d.kind === "freeze"
              ? "covered by a freeze"
              : d.kind === "repair"
                ? "repaired"
                : d.today
                  ? "today, not yet"
                  : "no round"
        return (
          <li
            key={d.day}
            className="flex w-4 flex-col items-center gap-1.5"
            aria-label={`${d.day}: ${label}`}
          >
            <span className="flex size-4 items-center justify-center">
              {d.kind === "freeze" ? (
                <SnowflakeIcon className="size-3.5 text-silver-mist" strokeWidth={1.5} />
              ) : d.kind ? (
                <Mark filled className="text-deep-verdant" />
              ) : d.today ? (
                <Mark filled={false} className="text-ash-gray" />
              ) : (
                <span className="size-1 rounded-full bg-white/18" />
              )}
            </span>
            <span
              className={cn(
                "text-[10px] leading-none",
                d.today ? "text-bone-white" : "text-ash-gray",
              )}
            >
              {weekdayInitial(d.day)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

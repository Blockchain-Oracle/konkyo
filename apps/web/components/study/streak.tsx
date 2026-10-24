"use client"

import { weekdayInitial } from "@konkyo/study"
import { Tooltip, TooltipContent, TooltipTrigger } from "@konkyo/ui/components/tooltip"
import { cn } from "@konkyo/ui/lib/utils"
import type { StreakView } from "@/lib/study"

/**
 * The streak and the freezes held (plan F31), in words on a white sticker (no icons): "3-day
 * streak · 2 freezes". It sits on the black scoreboard.
 */
export function StreakPill({ streak, className }: { streak: StreakView; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-extrabold tabular-nums",
              streak.doneToday ? "bg-lime text-ink" : "bg-white text-ink",
              className,
            )}
          />
        }
      >
        {streak.current ? `${streak.current}-day streak` : "no streak yet"}
        <span aria-hidden>·</span>
        {streak.freezes === 1 ? "1 freeze" : `${streak.freezes} freezes`}
      </TooltipTrigger>
      <TooltipContent>
        {streak.current
          ? `${streak.current}-day streak${streak.doneToday ? "" : " · a round today keeps it"}`
          : "Finish a round to start a streak"}
        . A freeze covers a missed day automatically; one comes back every 7 days.
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * The last seven days as dots (study.css .week-strip): lime for a studied day, a dashed ring for a
 * day a freeze covered, a white ring for today still open. A missed day is just empty: the break
 * is never highlighted.
 */
export function WeekStrip({ week, className }: { week: StreakView["week"]; className?: string }) {
  return (
    <ol className={cn("week-strip", className)} aria-label="The last seven days">
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
          <li key={d.day} aria-label={`${d.day}: ${label}`}>
            <span className={cn(d.today && "is-today")}>
              <i
                className={cn(
                  (d.kind === "done" || d.kind === "repair") && "is-on",
                  d.kind === "freeze" && "border-dashed! border-white!",
                )}
              />
              {weekdayInitial(d.day)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

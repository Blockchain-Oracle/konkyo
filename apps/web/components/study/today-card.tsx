"use client"

import { Button } from "@konkyo/ui/components/button"
import { Skeleton } from "@konkyo/ui/components/skeleton"
import { cn } from "@konkyo/ui/lib/utils"
import Link from "next/link"
import { useSyncExternalStore } from "react"
import { sessionHref, useToday } from "@/lib/use-study"
import { StreakPill, WeekStrip } from "./streak"

const noop = () => () => {}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "tomorrow", "on Tuesday", "on 3 Nov": when the next review falls. */
function whenNext(at: string) {
  const due = new Date(at)
  const today = new Date()
  const days = Math.round(
    (new Date(due.toDateString()).getTime() - new Date(today.toDateString()).getTime()) /
      86_400_000,
  )
  if (days <= 0) return "later today"
  if (days === 1) return "tomorrow"
  if (days < 7) return `on ${due.toLocaleDateString(undefined, { weekday: "long" })}`
  return `on ${due.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
}

/**
 * Today's review (plan F29, Home and Study): what's due, from how many files, one button; when
 * nothing's due, when the next review is. A broken streak's repair is a neutral line here.
 */
export function TodayCard({
  variant = "home",
  className,
  pinned,
}: {
  variant?: "home" | "study"
  className?: string
  /** On a board: a push pin at the top (OurSpaces' pinned card). */
  pinned?: boolean
}) {
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  )
  const { data, isPending } = useToday(mounted)
  if (!mounted || isPending)
    return variant === "study" ? <Skeleton className="h-36 w-full rounded-2xl" /> : null
  // Home stays quiet until there's something to review.
  if (!data || (!data.hasItems && variant === "home")) return null
  const { streak } = data
  const title = data.due
    ? `${plural(data.due, "card")} from ${plural(Math.max(1, data.files), "file")}`
    : data.hasItems
      ? "All caught up"
      : "Nothing to review yet"
  const detail = data.due
    ? [data.reviews ? `${data.reviews} due` : null, data.fresh ? `${data.fresh} new` : null]
        .filter(Boolean)
        .join(" · ")
    : data.next
      ? `Next review ${whenNext(data.next.at)} · ${plural(data.next.count, "card")}`
      : data.hasItems
        ? "Play a game below to keep going."
        : "Make practice from a file or folder below. Items you answer come back here."

  return (
    <section
      aria-labelledby={`today-${variant}`}
      className={cn("scoreboard", variant === "home" && !className && "mt-12", className)}
    >
      {pinned && <span className="board-pin" aria-hidden />}
      <div className="flex items-center justify-between gap-4">
        <h2 id={`today-${variant}`} className="scoreboard-live">
          today's review
        </h2>
        <StreakPill streak={streak} />
      </div>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-5">
        <div className="min-w-0">
          <p className="scoreboard-number">{data.due}</p>
          <p className="scoreboard-label mt-2">
            {data.due
              ? `due, from ${plural(Math.max(1, data.files), "source")}`
              : title.toLowerCase()}
          </p>
          <p className="scoreboard-sub mt-1">{detail}</p>
        </div>
        <WeekStrip week={streak.week} />
      </div>
      {streak.repair && !streak.doneToday && (
        <p className="scoreboard-sub mt-5 border-t border-white/12 pt-4">
          Your {streak.repair.streak}-day streak can come back:{" "}
          {streak.repair.roundsLeft
            ? `finish ${plural(streak.repair.roundsLeft, "round")} today.`
            : "it's back."}
        </p>
      )}
      {(data.due > 0 || variant === "home") && (
        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          {data.due > 0 && (
            <Button render={<Link href={sessionHref({ mode: "review" })} />} nativeButton={false}>
              start review →
            </Button>
          )}
          {variant === "home" && (
            <Link
              href="/study"
              className="rounded-full bg-white px-3.5 py-2 text-[13px] font-extrabold text-ink transition-transform duration-(--duration-press) hover:-translate-y-0.5"
            >
              all practice ↗
            </Link>
          )}
        </div>
      )}
    </section>
  )
}

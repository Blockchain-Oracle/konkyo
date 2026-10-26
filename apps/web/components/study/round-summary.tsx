"use client"

import type { Outcome } from "@konkyo/study"
import { Button } from "@konkyo/ui/components/button"
import { cn } from "@konkyo/ui/lib/utils"
import { m } from "motion/react"
import type { Route } from "next"
import Link from "next/link"
import { useEffect, useMemo, useRef } from "react"
import type { RoundItem, StreakView } from "@/lib/study"
import { SourceChip } from "./feedback"
import { StreakPill, WeekStrip } from "./streak"

export type RoundResult = { item: RoundItem; outcome: Outcome; recovered?: boolean }
export type Finished = {
  counted: boolean
  celebrate: boolean
  repaired: boolean
  streak: StreakView
}

const COLOURS = ["#7853ff", "#e9369d", "#3f70ff", "#ff7c42", "#13b8a6", "#c9ff3d"]

/** Day 7 (and every seventh): the brand's triangles burst out once. */
function Celebrate() {
  const bits = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => {
        const angle = (i / 36) * Math.PI * 2 + (i % 3) * 0.3
        const distance = 120 + ((i * 37) % 160)
        return {
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance * 0.7 - 40,
          turn: (i * 67) % 360,
          size: 5 + (i % 4) * 2,
          colour: COLOURS[i % COLOURS.length] as string,
          filled: i % 3 === 0,
        }
      }),
    [],
  )
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-24 flex justify-center">
      {bits.map((b, i) => (
        <m.svg
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed burst
          key={i}
          viewBox="-6 -6 12 12"
          width={b.size * 2}
          height={b.size * 2}
          className="absolute"
          initial={{ x: 0, y: 0, opacity: 0, rotate: 0, scale: 0.4 }}
          animate={{ x: b.x, y: b.y, opacity: [0, 1, 1, 0], rotate: b.turn, scale: 1 }}
          transition={{ duration: 1.6, ease: [0.23, 1, 0.32, 1], delay: (i % 6) * 0.03 }}
        >
          <polygon
            points="0,-5 4.33,2.5 -4.33,2.5"
            fill={b.filled ? b.colour : "none"}
            stroke={b.colour}
            strokeWidth="1"
          />
        </m.svg>
      ))}
    </div>
  )
}

const GLYPH: Record<Outcome, { mark: string; className: string; label: string }> = {
  right: { mark: "✓", className: "bg-lime text-ink", label: "Right first time" },
  helped: { mark: "↺", className: "bg-orange text-ink", label: "Right with help" },
  shown: { mark: "?", className: "bg-white text-ink ring-2 ring-ink", label: "Answer shown" },
}

/**
 * The end of a round: the score, the streak, one row per item with its source, and
 * the ones to try again. Wrong is never red.
 */
export function RoundSummary({
  results,
  finished,
  againHref,
  nextHref,
}: {
  results: RoundResult[]
  finished: Finished | null
  againHref: string | null
  nextHref: string
}) {
  const right = results.filter((r) => r.outcome === "right").length
  const helped = results.filter((r) => r.outcome === "helped").length
  const shown = results.filter((r) => r.outcome === "shown").length
  const missed = results.filter((r) => r.outcome !== "right").length
  // The round ends wherever the last item left the page; the summary starts at its top.
  const top = useRef<HTMLDivElement>(null)
  useEffect(() => {
    top.current?.scrollIntoView({ block: "start" })
  }, [])
  const streakLine = finished
    ? finished.celebrate
      ? `${finished.streak.current} days in a row`
      : finished.repaired
        ? "streak repaired"
        : finished.counted
          ? finished.streak.current > 1
            ? `${finished.streak.current}-day streak`
            : "streak started"
          : "this round didn't count"
    : null
  return (
    <div ref={top} className="relative scroll-mt-24">
      {finished?.celebrate && <Celebrate />}
      <span className="room-pill">
        <span className="game-dot" aria-hidden /> round complete
      </span>

      <m.div
        initial={{ opacity: 0, y: 14, rotate: 1 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ duration: 0.4, ease: [0.2, 0.9, 0.3, 1.18] }}
        className="scoreboard mt-5"
      >
        {finished?.celebrate && (
          // biome-ignore lint/performance/noImgElement: a static sticker
          <img
            src="/stickers/day-seven.webp"
            alt=""
            className="absolute -top-10 -right-6 w-36 rotate-[9deg] drop-shadow-[0_6px_0_rgb(17_17_20/0.25)]"
          />
        )}
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="scoreboard-number">
              {right + helped}
              <span className="text-[0.42em] text-white">/{results.length}</span>
            </p>
            <p className="scoreboard-label mt-2">
              {right + helped === results.length ? "every one" : "recalled"}
            </p>
            <p className="scoreboard-sub mt-1">
              {[
                right ? `${right} right first time` : null,
                helped ? `${helped} with help` : null,
                shown ? `${shown} shown` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          {finished && (
            <div className="grid justify-items-end gap-3">
              <p className="font-display text-[20px] font-extrabold text-white">{streakLine}</p>
              <WeekStrip week={finished.streak.week} />
              <StreakPill streak={finished.streak} />
            </div>
          )}
        </div>
        {finished && (
          <p className="scoreboard-sub mt-5 border-t border-white/12 pt-4">
            {finished.celebrate
              ? "A week of real recall. You've earned a freeze back."
              : finished.counted
                ? "Answers you recalled count; shown ones don't."
                : "A round counts when you recall at least one answer yourself."}
          </p>
        )}
      </m.div>

      <section aria-label="This round" className="surface-paper paper-sheet mt-9">
        <ul>
          {results.map((r, i) => {
            const g = GLYPH[r.outcome]
            return (
              <li
                key={`${r.item.id}-${r.item.kind}`}
                className={cn("flex items-start gap-3.5 py-3.5", i > 0 && "border-t border-ink/10")}
              >
                <span
                  className={cn(
                    "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-black",
                    g.className,
                  )}
                  title={g.label}
                >
                  {g.mark}
                  <span className="sr-only">{g.label}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[16px] leading-snug font-semibold text-ink">
                    {r.item.kind === "cloze"
                      ? r.item.prompt.replace("____", r.item.answer)
                      : r.item.prompt}
                  </span>
                  {r.recovered && (
                    <span className="mt-1 block text-[12.5px] font-bold text-supports-text">
                      got it on the second go
                    </span>
                  )}
                </span>
                <SourceChip
                  ground={r.item.ground}
                  className="hidden max-w-56 shrink-0 sm:inline-flex"
                />
              </li>
            )
          })}
        </ul>
      </section>

      <div className="mt-8 flex flex-wrap gap-2.5">
        {againHref && missed > 0 && (
          <Button render={<Link href={againHref as Route} />} nativeButton={false}>
            try the {missed} you missed
          </Button>
        )}
        <Button
          render={<Link href={nextHref as Route} />}
          nativeButton={false}
          variant={againHref && missed ? "sticker" : "default"}
        >
          another round
        </Button>
        <Button render={<Link href="/study" />} nativeButton={false} variant="sticker">
          back to study
        </Button>
      </div>
    </div>
  )
}

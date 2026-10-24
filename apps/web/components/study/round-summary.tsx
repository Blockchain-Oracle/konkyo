"use client"

import type { Outcome } from "@konkyo/study"
import { Button } from "@konkyo/ui/components/button"
import { cn } from "@konkyo/ui/lib/utils"
import { CheckIcon, LightbulbIcon, RotateCcwIcon } from "lucide-react"
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

const COLOURS = ["#8052ff", "#15846e", "#c265aa", "#339f87", "#2d6caf", "#ffb829"]

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

const GLYPH: Record<Outcome, { icon: typeof CheckIcon; className: string; label: string }> = {
  right: { icon: CheckIcon, className: "bg-lime text-ink", label: "Right first time" },
  helped: {
    icon: RotateCcwIcon,
    className: "bg-saffron-spark/15 text-saffron-spark",
    label: "Right with help",
  },
  shown: { icon: LightbulbIcon, className: "bg-white/8 text-silver-mist", label: "Answer shown" },
}

/**
 * The end of a round (plan §7.5): the score, the streak, one row per item with its source, and
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
  return (
    <div ref={top} className="relative scroll-mt-6 pt-6">
      {finished?.celebrate && <Celebrate />}
      <m.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <p className="text-micro text-saffron-spark uppercase">Round complete</p>
        <h1 className="mt-3 text-heading-sm font-normal text-bone-white">
          {right + helped} of {results.length}
        </h1>
        <p className="mt-2 text-reading text-ash-gray">
          {[
            right ? `${right} right first time` : null,
            helped ? `${helped} with help` : null,
            shown ? `${shown} shown` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </m.div>

      {finished && (
        <div className="mt-8 flex flex-wrap items-end justify-between gap-5 rounded-2xl border border-border bg-panel p-5">
          <div>
            <p className="text-subhead text-bone-white">
              {finished.celebrate
                ? `${finished.streak.current} days in a row`
                : finished.repaired
                  ? "Streak repaired"
                  : finished.counted
                    ? finished.streak.current > 1
                      ? `${finished.streak.current}-day streak`
                      : "Streak started"
                    : "This round didn't count"}
            </p>
            <p className="mt-1 text-snippet text-ash-gray">
              {finished.celebrate
                ? "A week of real recall. You've earned a freeze back."
                : finished.counted
                  ? "Answers you recalled count; shown ones don't."
                  : "A round counts when you recall at least one answer yourself."}
            </p>
            <StreakPill streak={finished.streak} className="mt-3" />
          </div>
          <WeekStrip week={finished.streak.week} />
        </div>
      )}

      <ul className="mt-8 border-t border-border">
        {results.map((r) => {
          const g = GLYPH[r.outcome]
          const Icon = g.icon
          return (
            <li
              key={`${r.item.id}-${r.item.kind}`}
              className="flex items-start gap-3 border-b border-border py-3.5"
            >
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                  g.className,
                )}
                title={g.label}
              >
                <Icon className="size-3" strokeWidth={2.25} />
                <span className="sr-only">{g.label}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-ui text-bone-white">
                  {r.item.kind === "cloze"
                    ? r.item.prompt.replace("____", r.item.answer)
                    : r.item.prompt}
                </span>
                {r.recovered && (
                  <span className="mt-0.5 block text-meta text-supports-text">
                    Got it on the second go
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

      <div className="mt-8 flex flex-wrap gap-2">
        {againHref && missed > 0 && (
          <Button render={<Link href={againHref as Route} />} nativeButton={false}>
            Try the {missed} you missed again
          </Button>
        )}
        <Button
          render={<Link href={nextHref as Route} />}
          nativeButton={false}
          variant={againHref && missed ? "secondary" : "default"}
        >
          Another round
        </Button>
        <Button render={<Link href="/study" />} nativeButton={false} variant="ghost">
          Back to Study
        </Button>
      </div>
    </div>
  )
}

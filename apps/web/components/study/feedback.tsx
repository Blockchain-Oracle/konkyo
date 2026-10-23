"use client"

import { GRADE_LABEL, GRADES, type GradeValue } from "@konkyo/study"
import { Button } from "@konkyo/ui/components/button"
import { Kbd } from "@konkyo/ui/components/kbd"
import { cn } from "@konkyo/ui/lib/utils"
import { CheckIcon, LightbulbIcon, RotateCcwIcon } from "lucide-react"
import { m } from "motion/react"
import { useEffect, useRef } from "react"
import { openSource } from "@/lib/preview"
import type { RoundGround, RoundItem } from "@/lib/study"

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`

/** Where a passage is: "p. 11", "at 2:31". */
export const whereIs = (g: Pick<RoundGround, "page" | "tStart">) =>
  g.tStart != null ? `at ${clock(g.tStart)}` : g.page != null ? `p. ${g.page}` : ""

/** Opens the passage in the source pane, with the quoted words marked. */
export function openGround(g: RoundGround) {
  openSource({
    fileId: g.fileId,
    title: g.title,
    kind: g.kind,
    page: g.page ?? undefined,
    passageId: g.passageId,
    seconds: g.tStart ?? undefined,
    quote: g.quote || undefined,
  })
}

/** A cited source: its title and place; opens the passage. */
export function SourceChip({
  ground,
  n,
  className,
}: {
  ground: RoundGround
  n?: number
  className?: string
}) {
  const where = whereIs(ground)
  return (
    <button
      type="button"
      onClick={() => openGround(ground)}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-raised px-2.5 py-0.5 align-baseline text-snippet text-silver-mist transition-colors duration-(--duration-press) hover:border-white/24 hover:text-bone-white",
        className,
      )}
    >
      {n != null && <span className="text-meta text-ash-gray tabular-nums">{n}</span>}
      <span className="truncate">{ground.byline ?? ground.title}</span>
      {where && <span className="shrink-0 text-meta text-ash-gray">{where}</span>}
    </button>
  )
}

/** "Why?" (F28): the explanation from the student's own material, its [n] as source chips. */
export function WhyPanel({ item }: { item: RoundItem }) {
  const grounds = item.sides ? [item.sides.a, item.sides.b] : [item.ground]
  const parts = item.why.split(/(\[\d\])/g)
  return (
    <m.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      className="rounded-xl border border-border bg-panel p-4"
    >
      <p className="text-micro text-ash-gray uppercase">Why</p>
      <p className="mt-2 text-reading text-bone-white">
        {parts.map((part, i) => {
          const n = /^\[(\d)\]$/.exec(part)?.[1]
          const ground = n ? grounds[Number(n) - 1] : undefined
          return ground ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: the text's own order
            <SourceChip key={i} ground={ground} n={Number(n)} className="mx-0.5" />
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: the text's own order
            <span key={i}>{part.replace(/\s+$/, i === parts.length - 1 ? "" : " ")}</span>
          )
        })}
      </p>
      {!/\[\d\]/.test(item.why) && <SourceChip ground={item.ground} n={1} className="mt-3" />}
      <blockquote className="mt-3 border-l-2 border-saffron-spark/60 pl-3 text-snippet text-silver-mist">
        “{item.ground.quote}”
      </blockquote>
    </m.div>
  )
}

/** FSRS's four grades with when each brings the item back; the automatic one is preselected. */
export function GradeRow({
  intervals,
  value,
  onChange,
}: {
  intervals: Record<GradeValue, string>
  value: GradeValue
  onChange: (grade: GradeValue) => void
}) {
  return (
    <div role="radiogroup" aria-label="When to see this again" className="flex flex-wrap gap-1.5">
      {GRADES.map((g, i) => (
        // biome-ignore lint/a11y/useSemanticElements: segmented buttons, not native radios
        <button
          key={g}
          type="button"
          role="radio"
          aria-checked={value === g}
          onClick={() => onChange(g)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-snippet transition-colors duration-(--duration-press)",
            value === g
              ? "border-bone-white/70 bg-bone-white text-black"
              : "border-border text-silver-mist hover:border-white/24 hover:text-bone-white",
          )}
        >
          <span className="hidden text-meta opacity-60 sm:inline">{i + 1}</span>
          {GRADE_LABEL[g]}
          <span className={cn("tabular-nums", value === g ? "text-black/60" : "text-ash-gray")}>
            {intervals[g]}
          </span>
        </button>
      ))}
    </div>
  )
}

export type FeedbackState =
  | { kind: "right"; note?: string }
  | { kind: "wrong"; feedback?: string; hints: string[]; canHint: boolean }
  | { kind: "shown"; answer: React.ReactNode }

/**
 * The bar under an answer (Brilliant's pattern, plan §7.5): verdant "Right" with Why?; amber
 * "Not quite" with the hint ladder (Hint → Another hint → See answer). Never red.
 */
export function FeedbackBar({
  state,
  onHint,
  onReveal,
  onWhy,
  whyOpen,
  onContinue,
  grade,
  intervals,
  onGrade,
  repeat,
}: {
  state: FeedbackState
  onHint: () => void
  onReveal: () => void
  onWhy: () => void
  whyOpen: boolean
  onContinue: () => void
  grade: GradeValue
  intervals: Record<GradeValue, string>
  onGrade: (g: GradeValue) => void
  /** A missed item asked again at the end: it isn't rescheduled twice. */
  repeat?: boolean
}) {
  const done = state.kind !== "wrong"
  // Long items (four passages, two sources) push the bar below the fold: bring it into view.
  const bar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (state.kind) bar.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [state.kind])
  return (
    <m.div
      ref={bar}
      key={state.kind}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
      className={cn(
        "scroll-mb-24 rounded-2xl border bg-panel p-4 sm:p-5",
        state.kind === "right" && "border-deep-verdant/70",
        state.kind === "wrong" && "border-saffron-spark/55",
        state.kind === "shown" && "border-border",
      )}
    >
      <div aria-live="polite" className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
            state.kind === "right" && "bg-deep-verdant text-white",
            state.kind === "wrong" && "bg-saffron-spark/15 text-saffron-spark",
            state.kind === "shown" && "bg-white/8 text-silver-mist",
          )}
        >
          {state.kind === "right" ? (
            <CheckIcon className="size-3.5" strokeWidth={2.25} />
          ) : state.kind === "wrong" ? (
            <RotateCcwIcon className="size-3.5" strokeWidth={2} />
          ) : (
            <LightbulbIcon className="size-3.5" strokeWidth={1.75} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-subhead",
              state.kind === "right" && "text-supports-text",
              state.kind === "wrong" && "text-saffron-spark",
              state.kind === "shown" && "text-bone-white",
            )}
          >
            {state.kind === "right"
              ? "Right"
              : state.kind === "wrong"
                ? "Not quite. Try again."
                : "The answer"}
          </p>
          {state.kind === "right" && state.note && (
            <p className="mt-1 text-snippet text-silver-mist">{state.note}</p>
          )}
          {state.kind === "wrong" && state.feedback && (
            <p className="mt-1 text-snippet text-silver-mist">{state.feedback}</p>
          )}
          {state.kind === "wrong" &&
            state.hints.map((hint, i) => (
              <m.p
                // biome-ignore lint/suspicious/noArrayIndexKey: hints only ever append
                key={i}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2 flex gap-2 text-snippet text-bone-white"
              >
                <LightbulbIcon
                  className="mt-0.5 size-3.5 shrink-0 text-saffron-spark"
                  strokeWidth={1.75}
                />
                {hint}
              </m.p>
            ))}
          {state.kind === "shown" && (
            <div className="mt-1 text-reading text-bone-white">{state.answer}</div>
          )}
        </div>
      </div>

      {done && !repeat && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-meta text-ash-gray">See it again</p>
          <GradeRow intervals={intervals} value={grade} onChange={onGrade} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {state.kind === "wrong" ? (
          state.canHint ? (
            <Button variant="secondary" onClick={onHint}>
              <LightbulbIcon strokeWidth={1.5} />
              {state.hints.length ? "Another hint" : "Hint"}
              <Kbd className="ml-1 hidden sm:inline-flex">H</Kbd>
            </Button>
          ) : (
            <Button variant="secondary" onClick={onReveal}>
              See answer
            </Button>
          )
        ) : (
          <>
            {!whyOpen && (
              <Button variant="ghost" onClick={onWhy}>
                Why?
              </Button>
            )}
            <Button onClick={onContinue} autoFocus>
              Continue
              <Kbd className="ml-1 hidden bg-white/15 text-white sm:inline-flex">↵</Kbd>
            </Button>
          </>
        )}
      </div>
    </m.div>
  )
}

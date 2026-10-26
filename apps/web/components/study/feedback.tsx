"use client"

import { GRADE_LABEL, GRADES, type GradeValue } from "@konkyo/study"
import { Button } from "@konkyo/ui/components/button"
import { cn } from "@konkyo/ui/lib/utils"
import { m } from "motion/react"
import { useEffect, useRef } from "react"
import { whereIs } from "@/lib/format"
import { openSource } from "@/lib/preview"
import type { RoundGround, RoundItem } from "@/lib/study"

/** Where a passage is: "p. 11", "at 2:31". */

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
        "inline-flex max-w-full items-center gap-1.5 rounded-full border-2 border-ink bg-white px-2.5 py-0.5 align-baseline text-[13px] font-semibold text-ink transition-[translate,background-color] duration-(--duration-press) hover:-translate-y-px hover:bg-lime",
        className,
      )}
    >
      {n != null && <span className="font-extrabold tabular-nums">{n}</span>}
      <span className="truncate">{ground.byline ?? ground.title}</span>
      {where && <span className="shrink-0 text-ink-muted">{where}</span>}
      <span aria-hidden>↗</span>
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
      className="rounded-[18px] bg-white p-5 text-ink shadow-[0_0_0_2px_rgb(17_17_20/0.12),0_6px_0_rgb(17_17_20/0.1)]"
    >
      <p className="text-[12.5px] font-extrabold text-ink-muted">why, from your own sources</p>
      <p className="mt-2 text-[16.5px] leading-relaxed text-ink">
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
      <blockquote className="mt-4 text-[15.5px] leading-relaxed text-ink">
        <span className="hl">“{item.ground.quote}”</span>
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
          className="game-grade"
        >
          <span className="hidden tabular-nums sm:inline">{i + 1}</span>
          {GRADE_LABEL[g].toLowerCase()}
          <small className="tabular-nums">{intervals[g]}</small>
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
 * The bar under an answer: verdant "Right" with Why?; amber
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
  const tab =
    state.kind === "right" ? "right ✓" : state.kind === "wrong" ? "not quite" : "the answer"
  return (
    <m.div
      ref={bar}
      key={state.kind}
      initial={{ opacity: 0, y: 14, rotate: -2.4 }}
      animate={{ opacity: 1, y: 0, rotate: -0.6 }}
      transition={{ duration: 0.36, ease: [0.2, 0.9, 0.3, 1.18] }}
      className={cn("reply-slip scroll-mb-24", `tone-${state.kind}`)}
    >
      <span className="reply-slip-tab">{tab}</span>
      <div aria-live="polite">
        <p className="reply-slip-title">
          {state.kind === "right"
            ? "That's it."
            : state.kind === "wrong"
              ? "Not quite. Try once more."
              : "Here's what the source says."}
        </p>
        {state.kind === "right" && state.note && <p className="reply-slip-text">{state.note}</p>}
        {state.kind === "wrong" && state.feedback && (
          <p className="reply-slip-text">{state.feedback}</p>
        )}
        {state.kind === "wrong" &&
          state.hints.map((hint, i) => (
            <m.p
              // biome-ignore lint/suspicious/noArrayIndexKey: hints only ever append
              key={i}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="reply-slip-hint"
            >
              <b>hint {i + 1}</b>
              <span>{hint}</span>
            </m.p>
          ))}
        {state.kind === "shown" && (
          <div className="mt-2 text-[17px] leading-relaxed font-semibold text-ink">
            {state.answer}
          </div>
        )}
      </div>

      {done && !repeat && (
        <div className="mt-5 border-t-2 border-dashed border-ink/15 pt-4">
          <p className="mb-2.5 text-[12.5px] font-extrabold text-ink-muted">see it again</p>
          <GradeRow intervals={intervals} value={grade} onChange={onGrade} />
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        {state.kind === "wrong" ? (
          state.canHint ? (
            <Button variant="sticker" onClick={onHint}>
              {state.hints.length ? "another hint" : "a hint"}
              <span className="ml-1 hidden text-white/70 sm:inline">H</span>
            </Button>
          ) : (
            <Button variant="sticker" onClick={onReveal}>
              show me the answer
            </Button>
          )
        ) : (
          <>
            {!whyOpen && (
              <Button variant="sticker" onClick={onWhy}>
                why?
              </Button>
            )}
            <Button onClick={onContinue} autoFocus>
              next ↵
            </Button>
          </>
        )}
      </div>
    </m.div>
  )
}

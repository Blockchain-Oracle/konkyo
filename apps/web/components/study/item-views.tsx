"use client"

import { Button } from "@konkyo/ui/components/button"
import { Spinner } from "@konkyo/ui/components/spinner"
import { cn } from "@konkyo/ui/lib/utils"
import { useEffect, useRef } from "react"
import type { CompareSide, RoundItem } from "@/lib/study"
import { SourceChip, whereIs } from "./feedback"

/*
 * How each kind of item is played, in OurSpaces' game language (styles in study.css): the prompt
 * big in Bricolage on paper, choices as their poll rows with a numbered key, a statement as a taped
 * slip, typed answers in a big field, passages as slips, steps as numbered strips. Only the look
 * changed; every prop and rule is the session's (components/study/session.tsx).
 */

/** How an answer surface looks now: open, being checked, or settled. */
export type Look = "open" | "checking" | "wrong" | "right" | "shown"

const settled = (look: Look) => look === "right" || look === "shown"

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="game-kicker">
      <span className="game-dot" aria-hidden />
      {children}
    </p>
  )
}

/** The question, big; a long statement (evidence claims run to 250 characters) a size down. */
function Prompt({ children }: { children: React.ReactNode }) {
  const long = typeof children === "string" && children.length > 110
  return <h2 className={cn("game-prompt", long && "is-long")}>{children}</h2>
}

function CheckButton({ disabled, checking }: { disabled: boolean; checking: boolean }) {
  return (
    <Button
      type="submit"
      size="lg"
      disabled={disabled || checking}
      className="h-16 min-w-32 text-[17px]"
    >
      {checking ? <Spinner /> : null}
      {checking ? "checking…" : "check ↵"}
    </Button>
  )
}

// ------------------------------------------------------------------ recall and cloze

export function TypedAnswer({
  item,
  value,
  onChange,
  onCheck,
  look,
}: {
  item: RoundItem
  value: string
  onChange: (v: string) => void
  onCheck: () => void
  look: Look
}) {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (look === "open") input.current?.focus()
  }, [look])
  const locked = settled(look) || look === "checking"
  const state = cn(
    look === "right" && "is-right",
    look === "wrong" && "is-wrong",
    look === "shown" && "is-shown",
  )
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!locked && value.trim()) onCheck()
  }

  if (item.kind === "cloze") {
    const [before, after] = item.prompt.split("____")
    // Starts near the answer's length and grows with what's typed, so nothing scrolls out of view.
    const width = Math.max(6, Math.min(32, Math.max(item.answer.length, value.length) + 2))
    return (
      <form onSubmit={submit}>
        <Kicker>fill the blank</Kicker>
        <p className="game-cloze">
          {before}
          <input
            ref={input}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            readOnly={locked}
            aria-label="The missing words"
            autoComplete="off"
            spellCheck={false}
            style={{ width: `${width}ch` }}
            className={cn("game-blank", state)}
          />
          {after}
        </p>
        {!settled(look) && (
          <div className="mt-6 flex justify-end">
            <CheckButton disabled={!value.trim()} checking={look === "checking"} />
          </div>
        )}
      </form>
    )
  }

  return (
    <form onSubmit={submit}>
      <Kicker>say it in a few words</Kicker>
      <Prompt>{item.prompt}</Prompt>
      <div className="game-answer-row">
        <input
          ref={input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          readOnly={locked}
          placeholder="your answer"
          aria-label="Your answer"
          autoComplete="off"
          className={cn("game-input", state)}
        />
        {!settled(look) && <CheckButton disabled={!value.trim()} checking={look === "checking"} />}
      </div>
    </form>
  )
}

// ------------------------------------------------------------------ true / false, then fix it

export function TrueFalseView({
  item,
  stage,
  tried,
  onJudge,
  fix,
  onFix,
  onCheckFix,
  look,
}: {
  item: RoundItem
  stage: "judge" | "fix"
  /** Choices already tried and wrong. */
  tried: boolean[]
  onJudge: (value: boolean) => void
  fix: string
  onFix: (v: string) => void
  onCheckFix: () => void
  look: Look
}) {
  const fixRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (stage === "fix" && look === "open") {
      fixRef.current?.focus()
      fixRef.current?.setSelectionRange(fix.length, fix.length)
    }
  }, [stage, look, fix.length])
  const done = settled(look)
  const choice = (value: boolean, key: string) => {
    const wasTried = tried.includes(value)
    const isAnswer = String(value) === item.answer
    const picked = stage === "fix" ? isAnswer : done && isAnswer
    return (
      <button
        type="button"
        disabled={stage === "fix" || done || wasTried || look === "checking"}
        onClick={() => onJudge(value)}
        className={cn("game-option justify-center", picked && "is-right", wasTried && "is-tried")}
      >
        <span className="game-key" aria-hidden>
          {picked ? "✓" : wasTried ? "✕" : key}
        </span>
        {value ? "true" : "false"}
      </button>
    )
  }
  return (
    <div>
      <Kicker>{stage === "fix" ? "it's false. now make it true" : "true or false?"}</Kicker>
      <blockquote className={cn("game-statement", stage === "fix" && "is-struck")}>
        {item.prompt}
      </blockquote>
      {stage === "judge" ? (
        <div className="game-options is-pair">
          {choice(true, "1")}
          {choice(false, "2")}
        </div>
      ) : (
        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault()
            if (fix.trim() && !done) onCheckFix()
          }}
        >
          <textarea
            ref={fixRef}
            value={fix}
            onChange={(e) => onFix(e.target.value)}
            readOnly={done || look === "checking"}
            rows={3}
            aria-label="The statement, made true"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                if (fix.trim() && !done) onCheckFix()
              }
            }}
            className={cn(
              "game-input w-full",
              look === "right" && "is-right",
              look === "wrong" && "is-wrong",
            )}
          />
          {!done && (
            <div className="mt-4 flex justify-end">
              <CheckButton disabled={!fix.trim()} checking={look === "checking"} />
            </div>
          )}
        </form>
      )}
      {done && item.original && (
        <div className="mt-7 rounded-2xl bg-white p-5 shadow-[0_0_0_2px_rgb(17_17_20/0.1)]">
          <p className="text-[12.5px] font-extrabold text-ink-muted">the source says</p>
          <p className="mt-1.5 text-[17px] leading-relaxed text-ink">
            <span className="hl">“{item.original}”</span>
          </p>
          <SourceChip ground={item.ground} className="mt-3" />
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ find the evidence

export function EvidenceView({
  item,
  tried,
  eliminated,
  onChoose,
  look,
}: {
  item: RoundItem
  tried: string[]
  eliminated: string[]
  onChoose: (passageId: string) => void
  look: Look
}) {
  const done = settled(look)
  return (
    <div>
      <Kicker>which passage says this?</Kicker>
      <Prompt>{item.prompt}</Prompt>
      <ol className="mt-6 grid gap-3">
        {(item.options ?? []).map((o, i) => {
          const isAnswer = o.passageId === item.answer
          const wrong = tried.includes(o.passageId)
          const gone = eliminated.includes(o.passageId)
          const where = whereIs(o)
          return (
            <li key={o.passageId}>
              <button
                type="button"
                disabled={done || wrong || gone || look === "checking"}
                onClick={() => onChoose(o.passageId)}
                className={cn(
                  "game-slip",
                  done && isAnswer && "is-right",
                  wrong && "is-tried",
                  gone && "is-gone",
                )}
              >
                <span
                  className={cn(
                    "game-key",
                    done && isAnswer && "bg-lime text-ink",
                    wrong && "bg-[#c2185b]",
                  )}
                  aria-hidden
                >
                  {done && isAnswer ? "✓" : wrong || gone ? "✕" : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="game-slip-text">
                    {done && isAnswer ? <span className="hl">{o.excerpt}</span> : o.excerpt}
                  </span>
                  <span className="game-slip-meta">
                    {o.byline ?? o.title}
                    {where ? ` · ${where}` : ""}
                    {gone ? " · ruled out by a hint" : ""}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// ------------------------------------------------------------------ order the steps

export function OrderView({
  item,
  placed,
  marks,
  onPlace,
  onUnplace,
  onCheck,
  look,
}: {
  item: RoundItem
  /** Indices into `shuffled`, in the order the student placed them. */
  placed: number[]
  /** After a check: which slots were right. */
  marks: (boolean | null)[]
  onPlace: (index: number) => void
  onUnplace: (slot: number) => void
  onCheck: () => void
  look: Look
}) {
  const shuffled = item.shuffled ?? []
  const steps = item.steps ?? []
  const done = settled(look)
  const slots = done && look === "shown" ? steps : placed.map((i) => shuffled[i] as string)
  const pool = shuffled.map((s, i) => ({ s, i })).filter(({ i }) => !placed.includes(i))
  return (
    <div>
      <Kicker>put these in order</Kicker>
      <Prompt>{item.prompt.charAt(0).toUpperCase() + item.prompt.slice(1)}</Prompt>
      <ol className="mt-6 grid gap-2.5">
        {steps.map((_, slot) => {
          const text = slots[slot]
          const mark = done ? true : marks[slot]
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: slots are positions
            <li key={slot} className="game-step-slot">
              <span className="game-step-n">{slot + 1}</span>
              {text ? (
                <button
                  type="button"
                  disabled={done || look === "checking"}
                  onClick={() => onUnplace(slot)}
                  className={cn(
                    "game-step",
                    mark === true && "is-right",
                    mark === false && "is-wrong",
                  )}
                >
                  {text}
                </button>
              ) : (
                <span className="game-step is-empty" />
              )}
            </li>
          )
        })}
      </ol>
      {!done && pool.length > 0 && (
        <div className="mt-6">
          <p className="text-[13px] font-extrabold text-ink-muted">tap the next step</p>
          <div className="mt-2.5 flex flex-wrap gap-2.5">
            {pool.map(({ s, i }) => (
              <button key={i} type="button" onClick={() => onPlace(i)} className="game-chip">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
      {!done && pool.length === 0 && (
        <form
          className="mt-6 flex justify-end"
          onSubmit={(e) => {
            e.preventDefault()
            onCheck()
          }}
        >
          {/* Checked as it stands: move a step before checking again. */}
          <CheckButton disabled={marks.length > 0} checking={look === "checking"} />
        </form>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ compare the sources

function SideCard({
  side,
  label,
  picked,
  mark,
  pickable,
  reveal,
  onPick,
}: {
  side: CompareSide
  label: string
  picked?: number
  mark: boolean | null
  pickable: boolean
  reveal: boolean
  onPick: (i: number) => void
}) {
  return (
    <div className={cn("game-side", mark === true && "is-right", mark === false && "is-wrong")}>
      <div className="flex items-center gap-2.5">
        <span className="game-side-label">{label}</span>
        <SourceChip ground={side} className="min-w-0" />
      </div>
      <p className="game-side-text">
        {side.sentences.map((s, i) => {
          const isPicked = picked === i
          const isAnswer = reveal && side.answers.includes(i)
          return pickable || isPicked || isAnswer ? (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: sentences in order
              key={i}
              type="button"
              disabled={!pickable}
              onClick={() => onPick(i)}
              className={cn(
                "game-sentence",
                pickable && "is-pickable",
                isPicked && !reveal && "is-picked",
                isAnswer && "is-answer",
              )}
            >
              {s}
            </button>
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: sentences in order
            <span key={i} className="mr-1">
              {s}
            </span>
          )
        })}
      </p>
    </div>
  )
}

export function CompareView({
  item,
  stage,
  tried,
  onRelation,
  picks,
  sideMarks,
  onPick,
  onCheckPoint,
  look,
}: {
  item: RoundItem
  stage: "relation" | "point"
  tried: string[]
  onRelation: (r: "agree" | "disagree") => void
  picks: { a?: number; b?: number }
  sideMarks: { a: boolean | null; b: boolean | null }
  onPick: (side: "a" | "b", i: number) => void
  onCheckPoint: () => void
  look: Look
}) {
  const sides = item.sides
  if (!sides) return null
  const done = settled(look)
  const relation = (r: "agree" | "disagree", key: string) => {
    const wasTried = tried.includes(r)
    const isAnswer = r === item.relation
    const picked = stage === "point" ? isAnswer : done && isAnswer
    return (
      <button
        type="button"
        disabled={stage === "point" || done || wasTried || look === "checking"}
        onClick={() => onRelation(r)}
        className={cn("game-option justify-center", picked && "is-right", wasTried && "is-tried")}
      >
        <span className="game-key" aria-hidden>
          {picked ? "✓" : wasTried ? "✕" : key}
        </span>
        {r === "agree" ? "they agree" : "they disagree"}
      </button>
    )
  }
  const pointing = stage === "point" && !done
  return (
    <div>
      <Kicker>
        {stage === "point" ? "now point to where each says so" : "compare the sources"}
      </Kicker>
      <Prompt>{item.prompt}</Prompt>
      <div className="mt-6 flex flex-col gap-3 md:flex-row">
        <SideCard
          side={sides.a}
          label="A"
          picked={picks.a}
          mark={done ? true : sideMarks.a}
          pickable={pointing}
          reveal={done}
          onPick={(i) => onPick("a", i)}
        />
        <SideCard
          side={sides.b}
          label="B"
          picked={picks.b}
          mark={done ? true : sideMarks.b}
          pickable={pointing}
          reveal={done}
          onPick={(i) => onPick("b", i)}
        />
      </div>
      {stage === "relation" ? (
        <div className="game-options is-pair">
          {relation("agree", "1")}
          {relation("disagree", "2")}
        </div>
      ) : (
        !done && (
          <form
            className="mt-6 flex flex-wrap items-center justify-between gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (picks.a != null && picks.b != null) onCheckPoint()
            }}
          >
            <p className="text-[14px] font-semibold text-ink-muted">
              Tap one sentence in A and one in B.
            </p>
            <CheckButton
              disabled={picks.a == null || picks.b == null}
              checking={look === "checking"}
            />
          </form>
        )
      )}
    </div>
  )
}

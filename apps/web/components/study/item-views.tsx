"use client"

import { Button } from "@konkyo/ui/components/button"
import { Kbd } from "@konkyo/ui/components/kbd"
import { Spinner } from "@konkyo/ui/components/spinner"
import { Textarea } from "@konkyo/ui/components/textarea"
import { cn } from "@konkyo/ui/lib/utils"
import { CheckIcon, XIcon } from "lucide-react"
import { useEffect, useRef } from "react"
import type { CompareSide, RoundItem } from "@/lib/study"
import { SourceChip, whereIs } from "./feedback"

/** How an answer surface looks now: open, being checked, or settled. */
export type Look = "open" | "checking" | "wrong" | "right" | "shown"

const settled = (look: Look) => look === "right" || look === "shown"

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-micro text-ash-gray uppercase">{children}</p>
}

/** The question itself: large, plain, left-aligned (Dala's heading scale). */
function Prompt({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-3 text-heading-2xs font-normal text-pretty text-bone-white sm:text-[30px] sm:leading-[1.2] sm:tracking-[-0.02em]">
      {children}
    </h2>
  )
}

function CheckButton({ disabled, checking }: { disabled: boolean; checking: boolean }) {
  return (
    <Button type="submit" size="lg" disabled={disabled || checking} className="min-w-24">
      {checking ? <Spinner /> : null}
      Check
      {!checking && <Kbd className="ml-1 hidden bg-white/15 text-white sm:inline-flex">↵</Kbd>}
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
  const ring = cn(
    "outline-none transition-colors duration-(--duration-press)",
    look === "right" && "border-deep-verdant text-supports-text",
    look === "wrong" && "border-saffron-spark/70",
    look === "shown" && "border-border text-silver-mist line-through decoration-ash-gray/60",
    (look === "open" || look === "checking") && "border-line-strong focus:border-bone-white/70",
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
        <Label>Fill the blank</Label>
        <p className="mt-4 text-[22px] leading-[1.6] text-pretty text-bone-white sm:text-[26px]">
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
            className={cn(
              "mx-1 inline-block border-b-2 bg-transparent px-1 text-center align-baseline",
              ring,
            )}
          />
          {after}
        </p>
        {!settled(look) && (
          <div className="mt-8 flex justify-end">
            <CheckButton disabled={!value.trim()} checking={look === "checking"} />
          </div>
        )}
      </form>
    )
  }

  return (
    <form onSubmit={submit}>
      <Label>Recall</Label>
      <Prompt>{item.prompt}</Prompt>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <input
          ref={input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          readOnly={locked}
          placeholder="Your answer"
          aria-label="Your answer"
          autoComplete="off"
          className={cn(
            "h-12 w-full min-w-0 rounded-xl border bg-raised sm:flex-1 px-4 text-subhead text-bone-white placeholder:text-ash-gray",
            ring,
          )}
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
        className={cn(
          "flex h-16 flex-1 items-center justify-center gap-2 rounded-xl border text-subhead transition-colors duration-(--duration-press)",
          picked
            ? "border-deep-verdant bg-deep-verdant/12 text-bone-white"
            : wasTried
              ? "border-saffron-spark/50 text-ash-gray line-through"
              : "border-line-strong text-bone-white hover:border-bone-white/60 hover:bg-white/4 disabled:opacity-40",
        )}
      >
        <Kbd className="hidden sm:inline-flex">{key}</Kbd>
        {value ? "True" : "False"}
      </button>
    )
  }
  return (
    <div>
      <Label>{stage === "fix" ? "It's false. Now make it true" : "True or false?"}</Label>
      <blockquote className="mt-4 rounded-2xl border border-border bg-panel p-5 text-[21px] leading-[1.5] text-pretty text-bone-white sm:text-[24px]">
        {item.prompt}
      </blockquote>
      {stage === "judge" ? (
        <div className="mt-6 flex gap-3">
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
          <Textarea
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
              "min-h-24 resize-none rounded-xl bg-raised px-4 py-3 text-subhead",
              look === "right" && "border-deep-verdant",
              look === "wrong" && "border-saffron-spark/70",
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
        <div className="mt-6 border-l-2 border-saffron-spark/60 pl-4">
          <p className="text-meta text-ash-gray">The source says</p>
          <p className="mt-1 text-reading text-bone-white">“{item.original}”</p>
          <SourceChip ground={item.ground} className="mt-2" />
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
      <Label>Which passage says this?</Label>
      <Prompt>{item.prompt}</Prompt>
      <ol className="mt-7 space-y-2.5">
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
                  "flex w-full gap-3.5 rounded-xl border p-4 text-left transition-[border-color,background-color,opacity] duration-(--duration-press)",
                  done && isAnswer
                    ? "border-deep-verdant bg-deep-verdant/10"
                    : wrong
                      ? "border-saffron-spark/45 opacity-60"
                      : gone
                        ? "border-border opacity-25"
                        : "border-border hover:border-white/30 hover:bg-white/3 disabled:opacity-50",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border text-meta tabular-nums",
                    done && isAnswer
                      ? "border-deep-verdant bg-lime text-ink"
                      : "border-line-strong text-ash-gray",
                  )}
                >
                  {done && isAnswer ? (
                    <CheckIcon className="size-3.5" strokeWidth={2.5} />
                  ) : wrong || gone ? (
                    <XIcon className="size-3" strokeWidth={2} />
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-reading text-pretty text-silver-mist">
                    {o.excerpt}
                  </span>
                  <span className="mt-2 block truncate text-meta text-ash-gray">
                    {o.byline ?? o.title}
                    {where ? ` · ${where}` : ""}
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
      <Label>Put these in order</Label>
      <Prompt>{item.prompt.charAt(0).toUpperCase() + item.prompt.slice(1)}</Prompt>
      <ol className="mt-7 space-y-2">
        {steps.map((_, slot) => {
          const text = slots[slot]
          const mark = done ? true : marks[slot]
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: slots are positions
            <li key={slot} className="flex items-stretch gap-3">
              <span className="flex w-7 shrink-0 items-center justify-center text-snippet text-ash-gray tabular-nums">
                {slot + 1}
              </span>
              {text ? (
                <button
                  type="button"
                  disabled={done || look === "checking"}
                  onClick={() => onUnplace(slot)}
                  className={cn(
                    "flex min-h-12 flex-1 items-center rounded-xl border px-4 py-2.5 text-left text-ui text-bone-white transition-colors duration-(--duration-press)",
                    mark === true && "border-deep-verdant bg-deep-verdant/10",
                    mark === false && "border-saffron-spark/60",
                    mark == null && "border-line-strong hover:border-white/40",
                  )}
                >
                  {text}
                </button>
              ) : (
                <span className="min-h-12 flex-1 rounded-xl border border-dashed border-border" />
              )}
            </li>
          )
        })}
      </ol>
      {!done && pool.length > 0 && (
        <div className="mt-6">
          <p className="text-meta text-ash-gray">Tap the next step</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {pool.map(({ s, i }) => (
              <button
                key={i}
                type="button"
                onClick={() => onPlace(i)}
                className="min-h-10 rounded-xl border border-border bg-raised px-3.5 py-2 text-left text-ui text-silver-mist transition-colors duration-(--duration-press) hover:border-white/30 hover:text-bone-white"
              >
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
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col rounded-2xl border bg-panel p-4",
        mark === true
          ? "border-deep-verdant/70"
          : mark === false
            ? "border-saffron-spark/55"
            : "border-border",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-line-strong text-meta text-silver-mist">
          {label}
        </span>
        <SourceChip ground={side} className="min-w-0" />
      </div>
      <p className="mt-3 max-h-72 overflow-y-auto pr-1 text-snippet leading-relaxed text-silver-mist">
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
                "mr-1 inline rounded-[3px] text-left transition-colors duration-(--duration-press)",
                pickable && "hover:bg-white/8 hover:text-bone-white",
                isPicked && !reveal && "bg-mark text-bone-white",
                isAnswer && "bg-highlight text-bone-white",
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
        className={cn(
          "flex h-14 flex-1 items-center justify-center gap-2 rounded-xl border text-subhead transition-colors duration-(--duration-press)",
          picked
            ? "border-deep-verdant bg-deep-verdant/12 text-bone-white"
            : wasTried
              ? "border-saffron-spark/50 text-ash-gray line-through"
              : "border-line-strong text-bone-white hover:border-bone-white/60 hover:bg-white/4 disabled:opacity-40",
        )}
      >
        <Kbd className="hidden sm:inline-flex">{key}</Kbd>
        {r === "agree" ? "They agree" : "They disagree"}
      </button>
    )
  }
  const pointing = stage === "point" && !done
  return (
    <div>
      <Label>{stage === "point" ? "Now point to where each says so" : "Compare the sources"}</Label>
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
        <div className="mt-6 flex gap-3">
          {relation("agree", "1")}
          {relation("disagree", "2")}
        </div>
      ) : (
        !done && (
          <form
            className="mt-6 flex items-center justify-between gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (picks.a != null && picks.b != null) onCheckPoint()
            }}
          >
            <p className="text-snippet text-ash-gray">Tap one sentence in A and one in B.</p>
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

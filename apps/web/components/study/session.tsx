"use client"

import { STUDY } from "@konkyo/config"
import type { StudyMode } from "@konkyo/db/schema"
import { type GradeValue, gradeFor, normalizeAnswer, type Outcome, quickGrade } from "@konkyo/study"
import { Button } from "@konkyo/ui/components/button"
import { Progress } from "@konkyo/ui/components/progress"
import { Skeleton } from "@konkyo/ui/components/skeleton"
import { Spinner } from "@konkyo/ui/components/spinner"
import { cn } from "@konkyo/ui/lib/utils"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckIcon, XIcon } from "lucide-react"
import { AnimatePresence, m } from "motion/react"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { EmptyState } from "@/components/empty-state"
import { api } from "@/lib/fetcher"
import type { Round, RoundItem, SetSummary } from "@/lib/study"
import { playSound, primeSounds, pulse, type StudySound } from "@/lib/study-sound"
import { sessionHref, studyKeys, useSet, useToday } from "@/lib/use-study"
import { FeedbackBar, type FeedbackState, openGround, WhyPanel } from "./feedback"
import { ItemMenu } from "./item-menu"
import {
  CompareView,
  EvidenceView,
  type Look,
  OrderView,
  TrueFalseView,
  TypedAnswer,
} from "./item-views"
import { type Finished, type RoundResult, RoundSummary } from "./round-summary"

type Phase = "answer" | "checking" | "wrong" | "right" | "shown"

/** Everything about the current try at one item. */
type Attempt = {
  phase: Phase
  /** Wrong tries, and hints shown: together they make "right" into "right with help". */
  tries: number
  hints: number
  value: string
  feedback?: string
  note?: string
  tfStage: "judge" | "fix"
  tfTried: boolean[]
  fix: string
  evTried: string[]
  evGone: string[]
  placed: number[]
  marks: (boolean | null)[]
  cmpStage: "relation" | "point"
  cmpTried: string[]
  picks: { a?: number; b?: number }
  sideMarks: { a: boolean | null; b: boolean | null }
  grade: GradeValue
  why: boolean
  startedAt: number
}

const fresh = (item: RoundItem): Attempt => ({
  phase: "answer",
  tries: 0,
  hints: 0,
  value: "",
  tfStage: "judge",
  tfTried: [],
  fix: item.prompt,
  evTried: [],
  evGone: [],
  placed: [],
  marks: [],
  cmpStage: "relation",
  cmpTried: [],
  picks: {},
  sideMarks: { a: null, b: null },
  grade: 3,
  why: false,
  startedAt: Date.now(),
})

/** A slot in the round; a missed item comes back once at the end, without being rescheduled again. */
type Slot = { item: RoundItem; repeat: boolean }

const outcomeOf = (a: Attempt): Outcome =>
  a.phase === "shown" ? "shown" : a.tries === 0 && a.hints === 0 ? "right" : "helped"

const lookOf = (phase: Phase): Look => (phase === "answer" ? "open" : phase)

const wide = () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches

// ------------------------------------------------------------------ while a set is being made

/** The set being made, live: every triangle is an item that passed the Verifier and Zetaris. */
function MakingSet({ set }: { set?: SetSummary }) {
  const made = set?.made ?? 0
  const dropped = set?.dropped ?? 0
  const slots = Math.max(STUDY.startAfter + 6, made + dropped)
  const steps = [
    {
      label: "Tutor",
      text: set?.passages
        ? `Reading ${set.passages} passages and drafting questions`
        : "Choosing the passages worth asking about",
      done: Boolean(set?.passages),
    },
    {
      label: "Verifier",
      text: `Checking every answer key against its passage${made + dropped ? ` · ${made} passed${dropped ? `, ${dropped} refused` : ""}` : ""}`,
      done: made >= STUDY.startAfter,
    },
    {
      label: "Zetaris",
      text: "Confirming each quote in its own reading of the source",
      done: made >= STUDY.startAfter,
    },
  ]
  return (
    <div className="pt-6">
      <p className="text-micro text-saffron-spark uppercase">Making practice</p>
      <h1 className="mt-3 text-heading-2xs font-normal text-bone-white">{set?.title ?? "…"}</h1>
      <svg
        viewBox={`0 0 ${slots * 14} 16`}
        preserveAspectRatio="xMinYMid meet"
        className="mt-8 h-4 w-full max-w-md"
        aria-label={`${made} items ready`}
      >
        {Array.from({ length: slots }, (_, i) => {
          const state = i < made ? "made" : i < made + dropped ? "dropped" : "waiting"
          return (
            <polygon
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed positions
              key={i}
              points="0,-5 4.33,2.5 -4.33,2.5"
              transform={`translate(${i * 14 + 7} 9)`}
              strokeWidth="1"
              strokeLinejoin="round"
              className={cn(
                "transition-[fill,stroke] duration-300",
                state === "made" && "fill-deep-verdant stroke-deep-verdant",
                state === "dropped" && "fill-none stroke-ash-gray/50",
                state === "waiting" && "fill-none stroke-white/12",
              )}
            />
          )
        })}
      </svg>
      <ol className="mt-8 space-y-4">
        {steps.map((s) => (
          <li key={s.label} className="flex items-start gap-3">
            <span className="mt-0.5 flex size-5 items-center justify-center">
              {s.done ? (
                <CheckIcon className="size-4 text-supports-text" strokeWidth={2} />
              ) : (
                <Spinner className="size-3.5 text-ash-gray" />
              )}
            </span>
            <span>
              <span className="block text-ui text-bone-white">{s.label}</span>
              <span className="block text-snippet text-ash-gray">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-10 max-w-md">
        <Progress value={Math.min(100, (made / STUDY.startAfter) * 100)} />
        <p className="mt-2 text-meta text-ash-gray">
          Your round starts once {STUDY.startAfter} items have passed every check; the rest keep
          coming.
        </p>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ the round

function Segments({
  slots,
  index,
  results,
}: {
  slots: Slot[]
  index: number
  results: RoundResult[]
}) {
  return (
    <div className="flex flex-1 gap-1" aria-hidden>
      {slots.map((slot, i) => {
        const r = i < index ? results[i] : undefined
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: positions
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-300",
              slot.repeat && "max-w-6",
              r?.outcome === "right" && "bg-deep-verdant",
              r?.outcome === "helped" && "bg-saffron-spark/70",
              r?.outcome === "shown" && "bg-white/30",
              i === index && "bg-bone-white/70",
              i > index && "bg-white/10",
            )}
          />
        )
      })}
    </div>
  )
}

export function StudySession({
  mode,
  setId,
  ids,
}: {
  mode: StudyMode
  setId?: string
  ids?: string[]
}) {
  const queryClient = useQueryClient()
  const set = useSet(setId)
  const today = useToday()
  const sound = today.data?.sound ?? true
  const waiting =
    mode === "quiz" &&
    Boolean(setId) &&
    !ids?.length &&
    (!set.data || (set.data.status === "generating" && set.data.made < STUDY.startAfter))
  const failed = mode === "quiz" && set.data?.status === "failed" && !set.data.items
  const round = useQuery({
    queryKey: ["study", "round", mode, setId ?? "", ids?.join(",") ?? ""],
    queryFn: () => {
      const q = new URLSearchParams({ mode })
      if (setId) q.set("set", setId)
      if (ids?.length) q.set("ids", ids.join(","))
      return api<Round>(`/api/study/round?${q}`)
    },
    enabled: !waiting && !failed,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    refetchOnWindowFocus: false,
  })

  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [index, setIndex] = useState(0)
  const [a, setA] = useState<Attempt | null>(null)
  const [results, setResults] = useState<RoundResult[]>([])
  const [finished, setFinished] = useState<Finished | null>(null)
  const [over, setOver] = useState(false)

  useEffect(() => {
    if (!round.data || slots) return
    setSlots(round.data.items.map((item) => ({ item, repeat: false })))
    const first = round.data.items[0]
    if (first) setA(fresh(first))
  }, [round.data, slots])

  // Sounds can only start after a gesture: the first tap or key in the session unlocks them.
  useEffect(() => {
    const prime = () => primeSounds()
    window.addEventListener("pointerdown", prime, { once: true })
    window.addEventListener("keydown", prime, { once: true })
    return () => {
      window.removeEventListener("pointerdown", prime)
      window.removeEventListener("keydown", prime)
    }
  }, [])
  const play = useCallback((name: StudySound) => playSound(name, sound), [sound])

  const slot = slots?.[index]
  const item = slot?.item

  // The last item's feedback scrolled itself into view; the next item starts at the top.
  const top = useRef<HTMLDivElement>(null)
  const itemKey = item ? `${index}:${item.id}` : ""
  useEffect(() => {
    if (itemKey) top.current?.scrollIntoView({ block: "start" })
  }, [itemKey])

  const patch = (next: Partial<Attempt>) => setA((prev) => (prev ? { ...prev, ...next } : prev))

  const right = (note?: string) => {
    play("right")
    pulse(25)
    setA((prev) =>
      prev
        ? { ...prev, phase: "right", note, grade: gradeFor(outcomeOf({ ...prev, phase: "right" })) }
        : prev,
    )
  }
  const miss = (feedback?: string, extra: Partial<Attempt> = {}) => {
    play("try-again")
    setA((prev) =>
      prev ? { ...prev, ...extra, phase: "wrong", feedback, tries: prev.tries + 1 } : prev,
    )
  }

  // ---------------------------------------------------------------- checking, per kind

  const checkTyped = async () => {
    if (!item || !a) return
    const given = a.value
    const quick = quickGrade(given, [item.answer, ...item.accepted])
    const differs = normalizeAnswer(given) !== normalizeAnswer(item.answer)
    if (quick === "right") return right(differs ? `Konkyo's answer: ${item.answer}` : undefined)
    if (quick === "wrong") return miss("Check the number.")
    const before = a.phase
    patch({ phase: "checking" })
    try {
      const r = await api<{ verdict: "right" | "close" | "wrong"; feedback: string }>(
        `/api/study/items/${item.id}/grade`,
        { method: "POST", json: { given } },
      )
      if (r.verdict === "right") right(differs ? `Konkyo's answer: ${item.answer}` : undefined)
      else miss(r.feedback || (r.verdict === "close" ? "Close. Be more specific." : undefined))
    } catch (error) {
      // Not checked is not wrong: the item goes back to exactly where it was.
      patch({ phase: before })
      toast.error("Couldn't check that answer", { description: (error as Error).message })
    }
  }

  const judge = (value: boolean) => {
    if (!item || !a) return
    if (String(value) === item.answer) {
      if (item.isTrue) right()
      else patch({ tfStage: "fix", phase: "answer", feedback: undefined })
    } else miss("Read it once more, closely.", { tfTried: [...a.tfTried, value] })
  }

  const checkFix = async () => {
    if (!item || !a) return
    if (normalizeAnswer(a.fix) === normalizeAnswer(item.prompt))
      return miss("That's the statement as it was. Change the detail that's wrong.")
    if (item.original && quickGrade(a.fix, [item.original]) === "right") return right()
    const before = a.phase
    patch({ phase: "checking" })
    try {
      const r = await api<{ verdict: "right" | "close" | "wrong"; feedback: string }>(
        `/api/study/items/${item.id}/grade`,
        { method: "POST", json: { given: a.fix, rewrite: true } },
      )
      if (r.verdict === "right") right()
      else miss(r.feedback)
    } catch (error) {
      patch({ phase: before })
      toast.error("Couldn't check that answer", { description: (error as Error).message })
    }
  }

  const choose = (passageId: string) => {
    if (!item || !a) return
    if (passageId === item.answer) right()
    else miss(undefined, { evTried: [...a.evTried, passageId] })
  }

  const checkOrder = () => {
    if (!item || !a) return
    const shuffled = item.shuffled ?? []
    const steps = item.steps ?? []
    const marks = a.placed.map((p, slotIndex) => shuffled[p] === steps[slotIndex])
    if (marks.every(Boolean)) {
      patch({ marks })
      right()
    } else miss(`${marks.filter(Boolean).length} of ${steps.length} in the right place.`, { marks })
  }

  const relate = (r: "agree" | "disagree") => {
    if (!item || !a) return
    if (r === item.relation) patch({ cmpStage: "point", phase: "answer", feedback: undefined })
    else miss("Look at what each one says on the point.", { cmpTried: [...a.cmpTried, r] })
  }

  const checkPoint = () => {
    if (!item?.sides || !a) return
    const ok = (side: "a" | "b") => {
      const answers = item.sides?.[side].answers ?? []
      const pick = a.picks[side]
      return pick != null && (!answers.length || answers.includes(pick))
    }
    const sideMarks = { a: ok("a"), b: ok("b") }
    if (sideMarks.a && sideMarks.b) {
      patch({ sideMarks })
      right()
    } else
      miss(
        !sideMarks.a && !sideMarks.b
          ? "Neither sentence shows it."
          : `The sentence in ${sideMarks.a ? "B" : "A"} doesn't show it.`,
        { sideMarks },
      )
  }

  // ---------------------------------------------------------------- the ladder

  const hint = () => {
    if (!item || !a || a.phase !== "wrong" || a.hints >= item.hints.length) return
    play("hint")
    const extra: Partial<Attempt> = {}
    if (item.kind === "evidence") {
      const left = (item.options ?? []).filter(
        (o) =>
          o.passageId !== item.answer &&
          !a.evTried.includes(o.passageId) &&
          !a.evGone.includes(o.passageId),
      )
      const drop = left[Math.floor(Math.random() * left.length)]
      if (drop) extra.evGone = [...a.evGone, drop.passageId]
    }
    patch({ ...extra, hints: a.hints + 1 })
  }

  const reveal = () => {
    if (!item || !a) return
    patch({
      phase: "shown",
      grade: 1,
      placed:
        item.kind === "order"
          ? (item.steps ?? []).map((s) => (item.shuffled ?? []).indexOf(s))
          : a.placed,
    })
  }

  const openWhy = () => {
    if (!item) return
    patch({ why: true })
    if (wide()) openGround(item.ground)
  }

  // ---------------------------------------------------------------- moving on

  const finish = async (all: RoundResult[], roundId: string) => {
    setOver(true)
    play("round")
    const counts = {
      right: all.filter((r) => r.outcome === "right").length,
      helped: all.filter((r) => r.outcome === "helped").length,
      shown: all.filter((r) => r.outcome === "shown").length,
    }
    try {
      const result = await api<Finished>("/api/study/rounds", {
        method: "POST",
        json: {
          roundId,
          mode,
          setId,
          items: all.length,
          ...counts,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      })
      setFinished(result)
      if (result.celebrate) {
        setTimeout(() => play("streak"), 350)
        pulse([30, 50, 60])
      }
    } catch (error) {
      toast.error((error as Error).message)
    }
    void queryClient.invalidateQueries({ queryKey: studyKeys.all })
  }

  const next = () => {
    if (!slots || !slot || !item || !a || !round.data) return
    const outcome = outcomeOf(a)
    const roundId = round.data.roundId
    if (!slot.repeat) {
      void api(`/api/study/items/${item.id}/review`, {
        method: "POST",
        json: {
          roundId,
          outcome,
          grade: a.grade,
          hints: a.hints,
          tries: a.tries + 1,
          answer: (item.kind === "truefalse" ? a.fix : a.value) || undefined,
          ms: Math.min(3_600_000, Date.now() - a.startedAt),
        },
      }).catch((error: Error) => toast.error(`Couldn't save that answer: ${error.message}`))
    }
    const all = slot.repeat
      ? results.map((r) =>
          r.item.id === item.id && r.item.kind === item.kind
            ? { ...r, recovered: outcome !== "shown" }
            : r,
        )
      : [...results, { item, outcome }]
    setResults(all)
    // A shown answer comes back once before the round ends (retrieval right after the answer).
    const queue = outcome === "shown" && !slot.repeat ? [...slots, { item, repeat: true }] : slots
    setSlots(queue)
    const following = queue[index + 1]
    if (!following) return void finish(all, roundId)
    setIndex(index + 1)
    setA(fresh(following.item))
  }

  const dropCurrent = () => {
    if (!slots || !round.data) return
    const queue = slots.filter((_, i) => i !== index)
    setSlots(queue)
    const following = queue[index]
    if (!following) return void finish(results, round.data.roundId)
    setA(fresh(following.item))
  }

  // ---------------------------------------------------------------- keys (plan §7.7)

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keyRef.current = (e: KeyboardEvent) => {
    if (!item || !a || over || e.metaKey || e.ctrlKey || e.altKey) return
    const target = e.target as HTMLElement | null
    const typing = Boolean(target?.closest("input, textarea, select, [contenteditable=true]"))
    const inDialog = Boolean(target?.closest("[role=dialog], [role=menu]"))
    if (inDialog) return
    if (a.phase === "right" || a.phase === "shown") {
      if (e.key === "Enter" && target?.tagName !== "BUTTON") {
        e.preventDefault()
        next()
      } else if (!typing && slot && !slot.repeat && ["1", "2", "3", "4"].includes(e.key))
        patch({ grade: Number(e.key) as GradeValue })
      return
    }
    if (typing) return
    if ((e.key === "h" || e.key === "H") && a.phase === "wrong") {
      e.preventDefault()
      if (a.hints < item.hints.length) hint()
      else reveal()
      return
    }
    const n = Number(e.key)
    if (!n || a.phase === "checking") return
    // The key picks an option; it mustn't also land in the text box the next step focuses.
    const pick = (fn: () => void) => {
      e.preventDefault()
      fn()
    }
    if (item.kind === "truefalse" && a.tfStage === "judge" && n <= 2) pick(() => judge(n === 1))
    else if (item.kind === "compare" && a.cmpStage === "relation" && n <= 2)
      pick(() => relate(n === 1 ? "agree" : "disagree"))
    else if (item.kind === "evidence") {
      const o = item.options?.[n - 1]
      if (o && !a.evTried.includes(o.passageId) && !a.evGone.includes(o.passageId))
        pick(() => choose(o.passageId))
    }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // ---------------------------------------------------------------- render

  if (failed)
    return (
      <div className="pt-12 md:pt-16">
        <EmptyState
          label="Practice"
          title="Couldn't make practice"
          description={set.data?.problem ?? "Try again."}
        >
          <Button render={<Link href="/study" />} nativeButton={false} variant="secondary">
            Back to Study
          </Button>
        </EmptyState>
      </div>
    )
  if (waiting) return <MakingSet set={set.data} />
  if (round.isError)
    return (
      <div className="pt-12 md:pt-16">
        <EmptyState
          label="Practice"
          title="Couldn't start the round"
          description={(round.error as Error).message}
        >
          <Button onClick={() => void round.refetch()} variant="secondary">
            Try again
          </Button>
        </EmptyState>
      </div>
    )
  if (!round.data || !slots)
    return (
      <div className="space-y-6 pt-6">
        <Skeleton className="h-1 w-full" />
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  if (!slots.length && !over)
    return (
      <div className="pt-12 md:pt-16">
        <EmptyState
          label={mode === "review" ? "Today's review" : "Practice"}
          title={mode === "review" ? "Nothing due right now" : "Nothing to play here yet"}
          description={
            mode === "review"
              ? "Every item is scheduled for later. Make practice from another file, or play a game."
              : "Make practice from a file or folder first; its items appear in every game that suits them."
          }
        >
          <Button render={<Link href="/study" />} nativeButton={false} variant="secondary">
            Back to Study
          </Button>
        </EmptyState>
      </div>
    )

  if (over) {
    const missed = results.filter((r) => r.outcome !== "right").map((r) => r.item.id)
    return (
      <RoundSummary
        results={results}
        finished={finished}
        againHref={
          missed.length
            ? sessionHref({ mode: mode === "review" ? "quiz" : mode, ids: [...new Set(missed)] })
            : null
        }
        nextHref={sessionHref({ mode, set: setId })}
      />
    )
  }
  if (!item || !a) return null

  const look = lookOf(a.phase)
  const feedback: FeedbackState | null =
    a.phase === "right"
      ? { kind: "right", note: a.note }
      : a.phase === "wrong"
        ? {
            kind: "wrong",
            feedback: a.feedback,
            hints: item.hints.slice(0, a.hints),
            canHint: a.hints < item.hints.length,
          }
        : a.phase === "shown"
          ? {
              kind: "shown",
              answer:
                item.kind === "truefalse"
                  ? item.isTrue
                    ? "It's true, as the source says."
                    : "It's false. The source's own sentence is with it."
                  : item.kind === "evidence"
                    ? "The marked passage says it."
                    : item.kind === "order"
                      ? "The steps are now in their real order."
                      : item.kind === "compare"
                        ? `They ${item.relation}. The highlighted sentences show it.`
                        : item.answer,
            }
          : null

  return (
    <div ref={top} className="pb-16">
      <header className="sticky top-0 z-10 -mx-6 flex items-center gap-4 bg-background/90 px-6 pt-4 pb-3 backdrop-blur-sm md:pt-6">
        <Button
          variant="ghost"
          size="icon-sm"
          render={<Link href="/study" />}
          nativeButton={false}
          aria-label="End the round"
        >
          <XIcon strokeWidth={1.5} />
        </Button>
        <Segments slots={slots} index={index} results={results} />
        <span className="text-snippet text-ash-gray tabular-nums">
          {index + 1} / {slots.length}
        </span>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        <m.section
          key={`${index}-${item.id}-${item.kind}`}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          className="pt-8 md:pt-12"
          aria-label="Practice item"
        >
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="truncate text-meta text-ash-gray">
              {item.topic}
              {slot?.repeat ? " · one more try" : item.isNew ? " · new" : ""}
              {item.unchecked ? " · your edit, not checked" : ""}
            </span>
            <ItemMenu
              item={item}
              onEdited={(edited) =>
                setSlots((prev) =>
                  prev
                    ? prev.map((s, i) =>
                        i === index ? { ...s, item: { ...s.item, ...edited } } : s,
                      )
                    : prev,
                )
              }
              onRemoved={dropCurrent}
            />
          </div>

          {(item.kind === "recall" || item.kind === "cloze") && (
            <TypedAnswer
              item={item}
              value={a.value}
              onChange={(value) =>
                patch({ value, ...(a.phase === "wrong" ? { phase: "answer" } : {}) })
              }
              onCheck={() => void checkTyped()}
              look={look}
            />
          )}
          {item.kind === "truefalse" && (
            <TrueFalseView
              item={item}
              stage={a.tfStage}
              tried={a.tfTried}
              onJudge={judge}
              fix={a.fix}
              onFix={(fix) =>
                patch({
                  fix,
                  ...(a.phase === "wrong" && a.tfStage === "fix" ? { phase: "answer" } : {}),
                })
              }
              onCheckFix={() => void checkFix()}
              look={look}
            />
          )}
          {item.kind === "evidence" && (
            <EvidenceView
              item={item}
              tried={a.evTried}
              eliminated={a.evGone}
              onChoose={choose}
              look={look}
            />
          )}
          {item.kind === "order" && (
            <OrderView
              item={item}
              placed={a.placed}
              marks={a.marks}
              onPlace={(i) => patch({ placed: [...a.placed, i], marks: [] })}
              onUnplace={(slotIndex) =>
                patch({ placed: a.placed.filter((_, j) => j !== slotIndex), marks: [] })
              }
              onCheck={checkOrder}
              look={look}
            />
          )}
          {item.kind === "compare" && (
            <CompareView
              item={item}
              stage={a.cmpStage}
              tried={a.cmpTried}
              onRelation={relate}
              picks={a.picks}
              sideMarks={a.sideMarks}
              onPick={(side, i) =>
                patch({
                  picks: { ...a.picks, [side]: i },
                  sideMarks: { ...a.sideMarks, [side]: null },
                })
              }
              onCheckPoint={checkPoint}
              look={look}
            />
          )}

          <div className="mt-8 space-y-3">
            {feedback && (
              <FeedbackBar
                state={feedback}
                onHint={hint}
                onReveal={reveal}
                onWhy={openWhy}
                whyOpen={a.why}
                onContinue={next}
                grade={a.grade}
                intervals={item.intervals}
                onGrade={(grade) => patch({ grade })}
                repeat={slot?.repeat}
              />
            )}
            {a.why && <WhyPanel item={item} />}
          </div>
        </m.section>
      </AnimatePresence>
    </div>
  )
}

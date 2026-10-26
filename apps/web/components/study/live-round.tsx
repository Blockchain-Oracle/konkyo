"use client"

import { ROUNDS } from "@konkyo/config"
import type { RoundGround } from "@konkyo/db/schema"
import { OTPField } from "@konkyo/ui/components/otp-field"
import { readableInk } from "@konkyo/ui/lib/space"
import { cn } from "@konkyo/ui/lib/utils"
import { useQueryClient } from "@tanstack/react-query"
import {
  AnimatePresence,
  animate,
  motion,
  motionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
} from "motion/react"
import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { MemberFace } from "@/components/people/member-face"
import { useRoomWall } from "@/components/shell/wall"
import { api } from "@/lib/fetcher"
import { clock } from "@/lib/format"
import type { Face } from "@/lib/profiles"
import type { RoundView } from "@/lib/rounds"
import { sound } from "@/lib/sounds"
import { useQuery } from "@/lib/use-query"

/*
 * Study together, played on the space's colour: the lobby with its code (Around's
 * "who's in"), one question at a time face down with a soft timer,
 * then the bars with everyone's faces on what they picked and the passage behind the answer,
 * a team score, and a recap that offers the ones the team missed.
 */

const KIND_LABEL: Record<NonNullable<RoundView["question"]>["kind"], string> = {
  truefalse: "true or false?",
  recall: "pick the answer",
  compare: "do the two sources agree?",
  evidence: "which passage says it?",
}

/** The page at /study/live/<code>: sit down in the round, then play it. */
export function RoundRoom({ code }: { code: string }) {
  const [joined, setJoined] = useState<{ id: string } | { error: string } | null>(null)
  useEffect(() => {
    let live = true
    api<{ id: string }>("/api/rounds/join", { method: "POST", json: { code } })
      .then((r) => live && setJoined({ id: r.id }))
      .catch((error: Error) => live && setJoined({ error: error.message }))
    return () => {
      live = false
    }
  }, [code])
  if (!joined)
    return (
      <RoundWall color="#7853ff">
        <p className="round-wait">finding round {code}…</p>
      </RoundWall>
    )
  if ("error" in joined)
    return (
      <RoundWall color="#7853ff">
        <section className="round-card round-gone">
          <p className="round-kicker">study together</p>
          <h1>{joined.error}</h1>
          <JoinWithCode />
          <Link className="round-quiet-link" href={"/study" as Route}>
            back to study
          </Link>
        </section>
      </RoundWall>
    )
  return <Round id={joined.id} />
}

function RoundWall({
  color,
  wall = "violet",
  children,
}: {
  color: string
  wall?: string
  children: ReactNode
}) {
  // the whole page takes the round's wall (its space's), behind the rail and the dock too
  useRoomWall(wall)
  return (
    <div
      className="round-wall"
      style={{ "--round": color, "--round-ink": readableInk(color) } as CSSProperties}
    >
      {children}
    </div>
  )
}

function Round({ id }: { id: string }) {
  const queryClient = useQueryClient()
  const key = ["round", id]
  const { data: round } = useQuery({
    queryKey: key,
    queryFn: () => api<RoundView>(`/api/rounds/${id}`),
    // the live stream moves it; this only catches a dropped connection
    refetchInterval: (q) => (q.state.data?.phase === "done" ? false : 10_000),
  })
  const skew = useRef(0)
  const lastVersion = useRef<number | null>(null)

  // the server's clock, so every phone counts down from the same moment
  useEffect(() => {
    if (round) skew.current = Date.parse(round.now) - Date.now()
  }, [round])

  // a sound when the round moves: the new question, or how your answer went
  useEffect(() => {
    if (!round) return
    if (lastVersion.current !== null && round.version !== lastVersion.current) {
      if (round.phase === "reveal" && round.question?.mine)
        sound(round.question.mine === round.question.answer ? "check" : "place")
      else if (round.phase === "question") sound("tap")
      else if (round.phase === "done") sound("promote")
    }
    lastVersion.current = round.version
  }, [round])

  if (!round)
    return (
      <RoundWall color="#7853ff">
        <p className="round-wait">…</p>
      </RoundWall>
    )
  const refresh = () => void queryClient.invalidateQueries({ queryKey: key })
  return (
    <RoundWall color={round.color} wall={round.wall}>
      <header className="round-top">
        <Link href={"/study" as Route} className="round-back">
          ← study
        </Link>
        <span className="round-title">{round.title.toLowerCase()}</span>
        <span className="round-code-chip" title="the join code">
          {round.code}
        </span>
      </header>
      {round.phase === "lobby" ? (
        <Lobby round={round} onMove={refresh} />
      ) : round.phase === "done" ? (
        <Recap round={round} />
      ) : (
        // a fresh stage per question: nothing from the last one (a pending answer, its timer) carries over
        <Stage key={round.at} round={round} skew={skew} onMove={refresh} />
      )}
    </RoundWall>
  )
}

// ------------------------------------------------------------------ the lobby

function Lobby({ round, onMove }: { round: RoundView; onMove: () => void }) {
  const [starting, setStarting] = useState(false)
  const host = round.players.find((p) => p.host)
  const link =
    typeof window === "undefined" ? "" : `${window.location.origin}/study/live/${round.code}`
  const start = async () => {
    setStarting(true)
    try {
      await api(`/api/rounds/${round.id}/start`, { method: "POST" })
      onMove()
    } catch (error) {
      toast.error((error as Error).message)
      setStarting(false)
    }
  }
  return (
    <section className="round-card round-lobby" aria-label="Lobby">
      <p className="round-kicker">live round · {round.total} questions</p>
      <h1>join with this code</h1>
      <p className="round-code">
        <span className="sr-only">The code is {round.code.split("").join(" ")}</span>
        {round.code.split("").map((c, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a code's letters can repeat
          <span key={i} aria-hidden="true">
            {c}
          </span>
        ))}
      </p>
      <button
        type="button"
        className="round-link"
        onClick={async () => {
          await navigator.clipboard.writeText(link)
          sound("tap")
          toast.success("Link copied")
        }}
      >
        konkyo.xyz/study/live/{round.code} <b>copy link</b>
      </button>

      <ul className="round-seats" aria-label="Who's in">
        <AnimatePresence initial={false}>
          {round.players.map((p) => (
            <motion.li
              key={p.userId}
              className="round-seat"
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 420, damping: 26 }}
            >
              <MemberFace face={p.face} size="md" />
              <small>
                {p.face.name.toLowerCase()}
                {p.host ? " · host" : ""}
              </small>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {round.youHost ? (
        <button
          type="button"
          className="claim-done round-go"
          onClick={() => void start()}
          disabled={starting}
        >
          {starting ? "starting…" : `start with ${round.players.length} →`}
        </button>
      ) : (
        <p className="round-note">
          waiting for {host?.face.name.toLowerCase() ?? "the host"} to start
        </p>
      )}
      <p className="round-small">
        Answers stay face down until everyone has answered or {round.seconds} seconds run out. The
        score is the team&apos;s.
      </p>
      {round.youHost && <EndRound roundId={round.id} onMove={onMove} className="round-end-early" />}
    </section>
  )
}

// ------------------------------------------------------------------ a question

function useSecondsLeft(endsAt: string | null, skew: { current: number }) {
  const [left, setLeft] = useState(() =>
    endsAt ? Math.max(0, Date.parse(endsAt) - (Date.now() + skew.current)) : 0,
  )
  useEffect(() => {
    if (!endsAt) return
    const tick = () => setLeft(Math.max(0, Date.parse(endsAt) - (Date.now() + skew.current)))
    tick()
    const timer = setInterval(tick, 200)
    return () => clearInterval(timer)
  }, [endsAt, skew])
  return left
}

function Stage({
  round,
  skew,
  onMove,
}: {
  round: RoundView
  skew: { current: number }
  onMove: () => void
}) {
  const q = round.question
  const faceUp = round.phase === "reveal"
  const left = useSecondsLeft(faceUp ? null : round.endsAt, skew)
  const [sending, setSending] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)
  const toldTimeUp = useRef<number | null>(null)

  // this phone's timer ran out: ask for the question to turn face up (once per version)
  useEffect(() => {
    if (faceUp || left > 0 || toldTimeUp.current === round.version) return
    toldTimeUp.current = round.version
    void api(`/api/rounds/${round.id}/time-up`, {
      method: "POST",
      json: { version: round.version },
    })
      .then(onMove)
      .catch(() => undefined)
  }, [faceUp, left, round.id, round.version, onMove])

  if (!q) return null
  const mine = q.mine ?? sending
  const waiting = round.players.filter((p) => !p.answered).length
  const answer = async (choice: string) => {
    if (mine || faceUp) return
    sound("tap")
    setSending(choice)
    try {
      await api(`/api/rounds/${round.id}/answer`, {
        method: "POST",
        json: { at: round.at, choice },
      })
      onMove()
    } catch (error) {
      setSending(null)
      toast.error((error as Error).message)
    }
  }
  const next = async () => {
    setMoving(true)
    try {
      await api(`/api/rounds/${round.id}/next`, {
        method: "POST",
        json: { version: round.version },
      })
      onMove()
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setMoving(false)
    }
  }
  const total = q.tally?.reduce((n, t) => n + t.faces.length, 0) ?? 0
  const last = round.at + 1 >= round.total
  const fraction = round.seconds ? left / (round.seconds * 1000) : 0

  return (
    <section className={cn("round-card round-stage", faceUp && "is-face-up")}>
      <div className="round-meta">
        <span>
          question {round.at + 1} of {round.total}
        </span>
        <span>{KIND_LABEL[q.kind]}</span>
        {faceUp ? (
          <span className="round-score" title="the team so far">
            together {round.team.right} of {round.team.answers}
          </span>
        ) : (
          <span
            className={cn("round-timer", left < 6000 && "is-low")}
            style={{ "--left": fraction } as CSSProperties}
            role="timer"
            aria-label={`${Math.ceil(left / 1000)} seconds left`}
          >
            {Math.ceil(left / 1000)}
          </span>
        )}
      </div>

      <h2 className="round-prompt">{q.prompt}</h2>

      {faceUp && q.tally ? (
        <section className="round-bars" aria-label="What everyone picked">
          {q.options.map((o, i) => {
            const faces = q.tally?.find((t) => t.optionId === o.id)?.faces ?? []
            return (
              <RevealBar
                key={o.id}
                label={o.label}
                share={total ? faces.length / total : 0}
                faces={faces}
                right={o.id === q.answer}
                mine={o.id === q.mine}
                delay={i * 0.08}
              />
            )
          })}
        </section>
      ) : (
        <div className="round-options">
          {q.options.map((o) => (
            <button
              key={o.id}
              type="button"
              className={cn("round-option", mine === o.id && "is-mine")}
              aria-pressed={mine === o.id}
              disabled={Boolean(mine)}
              onClick={() => void answer(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {faceUp ? (
        <>
          {q.ground && <RoundPassage ground={q.ground} />}
          {round.youHost ? (
            <button
              type="button"
              className="claim-done round-go"
              onClick={() => void next()}
              disabled={moving}
            >
              {last ? "see how we did →" : "next question →"}
            </button>
          ) : (
            <p className="round-note">the host moves on when everyone&apos;s read it</p>
          )}
        </>
      ) : (
        <div className="round-answered">
          <ul className="round-seat-row" aria-label="Who has answered">
            {round.players.map((p) => (
              <li
                key={p.userId}
                className={cn("round-mini", p.answered && "has-answered")}
                title={`${p.face.name}${p.answered ? " answered" : ""}`}
              >
                <MemberFace face={p.face} size="xs" />
                <span className="sr-only">
                  {p.face.name} {p.answered ? "has answered" : "is thinking"}
                </span>
              </li>
            ))}
          </ul>
          <span>
            {mine
              ? waiting
                ? `face down · waiting for ${waiting}`
                : "face down · turning over…"
              : "pick one"}
          </span>
        </div>
      )}
      {round.youHost && <EndRound roundId={round.id} onMove={onMove} className="round-end-early" />}
    </section>
  )
}

function EndRound({
  roundId,
  onMove,
  className,
}: {
  roundId: string
  onMove: () => void
  className?: string
}) {
  const [sure, setSure] = useState(false)
  return (
    <button
      type="button"
      className={className}
      onBlur={() => setSure(false)}
      onClick={async () => {
        if (!sure) return setSure(true)
        await api(`/api/rounds/${roundId}/end`, { method: "POST" }).catch(() => undefined)
        onMove()
      }}
    >
      {sure ? "tap again to end the round" : "end round"}
    </button>
  )
}

// ------------------------------------------------------------------ the reveal (poll-results)

const FILL = { type: "spring", stiffness: 210, damping: 34, mass: 0.9 } as const
const POP = { type: "spring", stiffness: 640, damping: 22, mass: 0.7 } as const

/**
 * One option's animated result bar: the fill springs to its
 * share through a clip-path, the percentage counts with it, and the right answer's tick pops in
 * once it lands. Here the faces of who picked it ride on the bar.
 */
function RevealBar({
  label,
  share,
  faces,
  right,
  mine,
  delay,
}: {
  label: string
  share: number
  faces: Face[]
  right: boolean
  mine: boolean
  delay: number
}) {
  const reduced = useReducedMotion() === true
  const progress = useRef(motionValue(0)).current
  const clipPath = useTransform(
    progress,
    (p) => `inset(0 ${((1 - p) * 100).toFixed(2)}% 0 0 round 12px)`,
  )
  const readout = useRef<HTMLSpanElement | null>(null)
  const [landed, setLanded] = useState(false)
  useMotionValueEvent(progress, "change", (p) => {
    const next = `${Math.round(p * 100)}%`
    if (readout.current && readout.current.textContent !== next) readout.current.textContent = next
  })
  useEffect(() => {
    if (reduced) {
      progress.jump(share)
      setLanded(true)
      return
    }
    const controls = animate(progress, share, { ...FILL, delay })
    void controls.finished.then(() => setLanded(true))
    return () => controls.stop()
  }, [share, reduced, progress, delay])
  return (
    <div className={cn("reveal-bar", right && "is-right", mine && "is-mine")}>
      <motion.span aria-hidden className="reveal-fill" style={{ clipPath }} />
      <span className="reveal-row">
        <span className="reveal-label">
          {label}
          {mine && <small> · you</small>}
        </span>
        <span className="reveal-faces">
          {faces.slice(0, 8).map((f, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: two players can share a name
            <MemberFace key={i} face={f} size="xs" />
          ))}
          {faces.length > 8 && <small>+{faces.length - 8}</small>}
        </span>
        <span className="reveal-tick" aria-hidden>
          <AnimatePresence initial={false}>
            {right && landed && (
              <motion.span
                initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={reduced ? { duration: 0 } : POP}
              >
                ✓
              </motion.span>
            )}
          </AnimatePresence>
        </span>
        <span ref={readout} className="reveal-share">
          0%
        </span>
      </span>
      {right && <span className="sr-only">the right answer</span>}
    </div>
  )
}

/** The passage the answer key was checked against, on paper, the quote marked. */
function RoundPassage({ ground }: { ground: RoundGround }) {
  const at = ground.context.indexOf(ground.quote)
  const where =
    ground.page != null
      ? `page ${ground.page}`
      : ground.tStart != null
        ? `at ${clock(ground.tStart)}`
        : null
  return (
    <figure className="round-passage">
      <blockquote>
        {at >= 0 ? (
          <>
            {ground.context.slice(0, at)}
            <mark>{ground.quote}</mark>
            {ground.context.slice(at + ground.quote.length)}
          </>
        ) : (
          <mark>{ground.quote}</mark>
        )}
      </blockquote>
      <figcaption>
        <strong>{ground.title}</strong>
        {[ground.byline, where].filter(Boolean).join(" · ")}
      </figcaption>
    </figure>
  )
}

// ------------------------------------------------------------------ the recap

function Recap({ round }: { round: RoundView }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const recap = round.recap
  const share = round.team.answers ? round.team.right / round.team.answers : 0
  const practise = async () => {
    setBusy(true)
    try {
      const { href } = await api<{ href: string }>(`/api/rounds/${round.id}/practise`, {
        method: "POST",
      })
      sound("promote")
      router.push(href as Route)
    } catch (error) {
      toast.error((error as Error).message)
      setBusy(false)
    }
  }
  return (
    <section className="round-card round-recap" aria-label="How the round went">
      <p className="round-kicker">round over · {round.players.length} played</p>
      <h1>
        together, {round.team.right} of {round.team.answers}
      </h1>
      <p className="round-note">
        {share >= 0.8
          ? "the team knew this well."
          : share > 0.5
            ? "more right than wrong. the misses are below."
            : share === 0.5
              ? "half right. the misses are below."
              : "this one's worth another go together."}
      </p>
      <ol className="round-recap-list">
        {recap?.questions.map((q, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the round's questions, in order
          <li key={i}>
            <details>
              <summary>
                <span className="round-recap-n">{i + 1}</span>
                <span className="round-recap-q">
                  {q.prompt}
                  <small>
                    ✓ {q.answer} · {q.right} of {q.answers} got it
                    {q.mine ? ` · you: ${q.mine.right ? "right" : q.mine.label}` : " · you skipped"}
                  </small>
                </span>
              </summary>
              <RoundPassage ground={q.ground} />
            </details>
          </li>
        ))}
      </ol>
      {recap?.canPractise ? (
        <button
          type="button"
          className="claim-done round-go"
          onClick={() => void practise()}
          disabled={busy}
        >
          {busy ? "getting them ready…" : `review the ones we missed (${recap.missed}) →`}
        </button>
      ) : recap?.missed ? (
        <p className="round-small">
          The missed ones come from sources you can&apos;t open on your own. Open each above to read
          its passage.
        </p>
      ) : (
        <p className="round-small">Nobody missed one. Nothing to review.</p>
      )}
      <Link className="round-quiet-link" href={"/study" as Route}>
        back to study
      </Link>
    </section>
  )
}

// ------------------------------------------------------------------ joining from elsewhere

/** Type a round's code (paste works; letters only from its alphabet) and walk in. */
export function JoinWithCode({ className }: { className?: string }) {
  const router = useRouter()
  return (
    <div className={cn("round-join", className)}>
      <span className="round-join-label">got a code?</span>
      <OTPField
        label="Round code"
        length={ROUNDS.codeLength}
        validationType="alphanumeric"
        inputMode="text"
        autoComplete="off"
        normalizeValue={(v) => v.toUpperCase()}
        onValueComplete={(code) => {
          sound("tap")
          router.push(`/study/live/${code}` as Route)
        }}
        aria-label="Round code"
      />
    </div>
  )
}

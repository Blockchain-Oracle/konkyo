"use client"

import type { KonkyoMessage } from "@konkyo/agents"
import { answerParts, type DeepState } from "@konkyo/agents/deep"
import { Button } from "@konkyo/ui/components/button"
import { Checkbox } from "@konkyo/ui/components/checkbox"
import { Input } from "@konkyo/ui/components/input"
import { Progress } from "@konkyo/ui/components/progress"
import { cn } from "@konkyo/ui/lib/utils"
import {
  ArrowUpRightIcon,
  CheckIcon,
  ChevronDownIcon,
  FileTextIcon,
  FolderIcon,
  GlobeIcon,
  RotateCcwIcon,
  SquareIcon,
  TelescopeIcon,
  TriangleAlertIcon,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { api } from "@/lib/fetcher"
import { useDeepRun } from "@/lib/use-deep-run"
import { LiveSteps } from "./run-receipt"

const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/** Seconds since the run began, ticking until it ends. */
function useElapsed(since: string | undefined, ended: boolean) {
  const [now, setNow] = useState(() => Date.now())
  const endedAt = useRef<number | null>(null)
  if (ended && endedAt.current == null) endedAt.current = Date.now()
  useEffect(() => {
    if (ended) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [ended])
  return since ? (endedAt.current ?? now) - new Date(since).getTime() : 0
}

/**
 * One outlined triangle per source found (plan §7.4 #6): the brand's particle field, here
 * counting real sources. Positions are fixed per index, so it grows without reshuffling.
 */
function Constellation({ count }: { count: number }) {
  const shown = Math.min(count, 40)
  const points = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => {
        // A low-discrepancy scatter (golden-ratio steps): even, but never a grid.
        const x = 5 + ((i * 0.618034) % 1) * 150
        const y = 5 + ((i * 0.754878) % 1) * 18
        const r = 2 + (i % 3) * 0.5
        const turn = (i * 47) % 360
        return { x, y, r, turn }
      }),
    [],
  )
  return (
    <svg
      viewBox="0 0 160 28"
      className="hidden h-7 w-40 sm:block"
      role="img"
      aria-label={`${count} sources found`}
    >
      {points.slice(0, shown).map((p, i) => (
        <polygon
          // biome-ignore lint/suspicious/noArrayIndexKey: positions are fixed per index
          key={i}
          points={`0,${-p.r} ${p.r * 0.87},${p.r * 0.5} ${-p.r * 0.87},${p.r * 0.5}`}
          transform={`translate(${p.x} ${p.y}) rotate(${p.turn})`}
          fill="none"
          strokeWidth="0.9"
          className={cn(
            "animate-in duration-(--duration-menu) fade-in-0 zoom-in-50",
            i === shown - 1
              ? "stroke-electric-iris"
              : i % 3 === 0
                ? "stroke-supports"
                : "stroke-white/35",
          )}
        />
      ))}
    </svg>
  )
}

function SourceIcon({ kind, className }: { kind: "paper" | "web"; className?: string }) {
  const Icon = kind === "paper" ? FileTextIcon : GlobeIcon
  return <Icon className={cn("size-3.5 text-ash-gray", className)} strokeWidth={1.5} aria-hidden />
}

/** The run grows inside one chat message, so a new part brings itself into view once. */
function useRevealOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [])
  return ref
}

function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRevealOnMount<HTMLDivElement>()
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}

/** Choose what to import (F18): the shortlist with why each was kept, and the folder name. */
function Approve({ runId, state }: { runId: string; state: DeepState }) {
  const shortlist = state.shortlist
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(shortlist?.candidates.map((c) => c.key)),
  )
  const [folder, setFolder] = useState(shortlist?.folderName ?? "")
  const [always, setAlways] = useState(false)
  const [sending, setSending] = useState(false)
  const ref = useRevealOnMount<HTMLDivElement>()
  if (!shortlist) return null
  const report = shortlist.report
  const submit = async () => {
    setSending(true)
    try {
      await api(`/api/runs/${runId}/approve`, {
        method: "POST",
        json: { keys: [...picked], folderName: folder.trim() || shortlist.folderName, always },
      })
    } catch (error) {
      setSending(false)
      toast.error((error as Error).message)
    }
  }
  return (
    <div
      ref={ref}
      className="mt-4 scroll-mb-40 animate-in rounded-card border border-border bg-panel duration-(--duration-menu) fade-in-0 slide-in-from-bottom-1"
    >
      <div className="border-b border-border p-4">
        <p className="text-ui text-bone-white">
          Import {picked.size} source{picked.size === 1 ? "" : "s"}?
        </p>
        <p className="mt-1 text-snippet text-ash-gray">
          They'll be read like your own files, then the question is answered from them, with every
          quote checked.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <FolderIcon className="size-4 shrink-0 text-ash-gray" strokeWidth={1.5} aria-hidden />
          {shortlist.intoFolder ? (
            <span className="text-snippet text-silver-mist">Into “{shortlist.folderName}”</span>
          ) : (
            <Input
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              maxLength={80}
              aria-label="Folder to import into"
              className="h-9 rounded-lg"
            />
          )}
        </div>
      </div>
      <ul className="max-h-96 divide-y divide-border overflow-y-auto">
        {shortlist.candidates.map((c) => (
          <li key={c.key} className="flex items-start gap-3 px-4 py-3">
            <Checkbox
              checked={picked.has(c.key)}
              onCheckedChange={(on) =>
                setPicked((prev) => {
                  const next = new Set(prev)
                  if (on) next.add(c.key)
                  else next.delete(c.key)
                  return next
                })
              }
              aria-label={`Import ${c.title}`}
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <p className="flex items-start gap-1.5 text-snippet text-bone-white">
                <SourceIcon kind={c.kind} className="mt-0.5 shrink-0" />
                <span className="line-clamp-2">{c.title}</span>
              </p>
              <p className="mt-0.5 truncate text-meta text-ash-gray">{c.detail}</p>
              {c.why && <p className="mt-1 text-meta text-silver-mist">{c.why}</p>}
            </div>
            {c.url && (
              <a
                href={c.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${c.title} on the web`}
                className="mt-0.5 shrink-0 text-ash-gray hover:text-bone-white"
              >
                <ArrowUpRightIcon className="size-3.5" strokeWidth={1.75} />
              </a>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3 border-t border-border p-4">
        <div className="mr-auto flex items-center gap-2">
          <Checkbox
            id={`${runId}-always`}
            checked={always}
            onCheckedChange={(on) => setAlways(Boolean(on))}
          />
          <label htmlFor={`${runId}-always`} className="text-snippet text-ash-gray">
            Import without asking next time
          </label>
        </div>
        <Button onClick={submit} disabled={!picked.size || sending}>
          {sending ? "Importing…" : `Import ${picked.size}`}
        </Button>
      </div>
      <p className="border-t border-border px-4 py-2.5 text-meta text-ash-gray">
        Screened {report.screened} sources in {report.steps} Markovian step
        {report.steps === 1 ? "" : "s"}, carrying only the shortlist between steps: about{" "}
        {Math.round(report.efficiencyPercent)}% fewer tokens than one long prompt ({report.label}).
      </p>
    </div>
  )
}

/** Each chosen source as it's downloaded and read. */
function Imports({ state }: { state: DeepState }) {
  if (!state.files.length) return null
  return (
    <ul className="mt-4 divide-y divide-border rounded-card border border-border bg-panel">
      {state.files.map((f) => {
        const ready = f.status === "ready"
        const stuck = f.status === "needs_you"
        return (
          <li key={f.key} className="flex items-center gap-3 px-4 py-2.5">
            <span className="grid size-5 shrink-0 place-items-center">
              {ready ? (
                <CheckIcon
                  className="size-3.5 text-supports"
                  strokeWidth={2.25}
                  aria-label="Ready"
                />
              ) : stuck ? (
                <TriangleAlertIcon
                  className="size-3.5 text-partly"
                  strokeWidth={1.75}
                  aria-label="Couldn't read"
                />
              ) : (
                <SourceIcon kind={f.key.startsWith("web:") ? "web" : "paper"} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-snippet text-silver-mist">{f.title}</p>
              {!ready && (
                <p className="truncate text-meta text-ash-gray">
                  {stuck ? (f.problem ?? "Couldn't be read") : (f.stage ?? "Waiting")}
                </p>
              )}
            </div>
            {!ready && !stuck && (
              <Progress
                value={Math.round((f.progress ?? 0) * 100)}
                className="w-20 shrink-0"
                aria-label={`${f.title}: ${Math.round((f.progress ?? 0) * 100)}%`}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * A deep search in the chat (plan F18–F19, §7.4 #6): live steps, every source as it's found,
 * the shortlist to approve, each import as it's read, then the cited answer. Rebuilt from the
 * run's event stream, so a reload lands back here mid-run. Once answered, the run folds into one
 * line above its answer.
 */
export function DeepRun({
  message,
  answerView,
  onSettled,
  onRetry,
}: {
  message: KonkyoMessage
  /** Renders the answer as any chat answer is rendered (citations, matrix, receipt, actions). */
  answerView: (message: KonkyoMessage, running: boolean) => React.ReactNode
  onSettled?: (runId: string) => void
  onRetry?: (question: string) => void
}) {
  const deep = message.parts.find((p) => p.type === "data-deep")
  const runId = deep?.type === "data-deep" ? deep.data.runId : ""
  const question = deep?.type === "data-deep" ? deep.data.question : ""
  const state = useDeepRun(runId)
  const ended = Boolean(state.end)
  const elapsed = useElapsed(message.metadata?.createdAt, ended)
  const [open, setOpen] = useState(false)
  const [steer, setSteer] = useState("")
  const settled = useRef(false)

  useEffect(() => {
    if (state.end && !settled.current) {
      settled.current = true
      onSettled?.(runId)
    }
  }, [state.end, runId, onSettled])

  // The saved answer once there is one; the live one while it's written.
  const saved = message.parts.some((p) => p.type === "data-final" || p.type === "data-notFound")
  const answering = state.answer.length > 0
  const answerMessage = useMemo<KonkyoMessage>(
    () => (saved ? message : { ...message, parts: answerParts(state.answer, true) }),
    [saved, message, state.answer],
  )
  const answered = saved || state.end?.status === "answered" || state.end?.status === "not-found"
  const papers = state.found.filter((f) => f.kind === "paper").length
  const active = !ended
  const awaiting = Boolean(state.shortlist && !state.approved && !state.shortlist.auto && active)

  const stop = () => void api(`/api/runs/${runId}/stop`, { method: "POST" })
  const sendSteer = async () => {
    const text = steer.trim()
    if (!text) return
    setSteer("")
    try {
      await api(`/api/runs/${runId}/steer`, { method: "POST", json: { text } })
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const details = (
    <>
      <LiveSteps steps={state.stages} />
      {state.found.length > 0 && !answering && (
        <ul className="mt-4 space-y-1" aria-label="Sources found">
          {state.found.slice(-4).map((f) => (
            <li
              key={f.key}
              className="flex animate-in items-center gap-2 text-meta text-ash-gray duration-(--duration-menu) fade-in-0 slide-in-from-left-1"
            >
              <SourceIcon kind={f.kind} />
              <span className="truncate text-silver-mist">{f.title}</span>
              {/* A page whose title couldn't be read is named by its site: once is enough. */}
              {f.detail && f.detail !== f.title && (
                <span className="shrink-0 truncate">· {f.detail}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {awaiting && <Approve runId={runId} state={state} />}
      {state.approved && !answered && <Imports state={state} />}
      {state.steers.length > 0 && (
        <p className="mt-3 text-meta text-ash-gray">
          Steered: {state.steers.map((s) => `“${s}”`).join(", ")}
        </p>
      )}
    </>
  )

  return (
    <div>
      <div className="flex items-center gap-3">
        <TelescopeIcon className="size-4 shrink-0 text-ash-gray" strokeWidth={1.5} aria-hidden />
        <span className="text-micro text-saffron-spark uppercase">Deep search</span>
        <span className="text-meta text-ash-gray tabular-nums">
          {clock(elapsed)}
          {state.found.length > 0 &&
            ` · ${papers} paper${papers === 1 ? "" : "s"}, ${state.found.length - papers} page${state.found.length - papers === 1 ? "" : "s"}`}
        </span>
        <Constellation count={state.found.length} />
        {active && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-2.5 text-snippet text-ash-gray hover:text-bone-white"
            onClick={stop}
          >
            <SquareIcon className="size-3 fill-current" strokeWidth={0} />
            Stop
          </Button>
        )}
      </div>

      {answered ? (
        <div className="mt-3">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 text-snippet text-ash-gray hover:text-silver-mist"
          >
            Found {state.found.length}, imported{" "}
            {state.files.filter((f) => f.status === "ready").length}
            {state.approved ? (
              <>
                {" "}
                into{" "}
                <Link
                  href={`/library/folders/${state.approved.folderId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-silver-mist underline-offset-2 hover:underline"
                >
                  {state.approved.folderName}
                </Link>
              </>
            ) : null}
            <ChevronDownIcon
              className={cn(
                "size-3.5 transition-transform duration-(--duration-menu)",
                open && "rotate-180",
              )}
              strokeWidth={1.75}
              aria-hidden
            />
          </button>
          {open && <div className="mt-3">{details}</div>}
        </div>
      ) : (
        <div className="mt-4">{details}</div>
      )}

      {active && !answering && !awaiting && (
        <form
          className="mt-4 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void sendSteer()
          }}
        >
          <Input
            value={steer}
            onChange={(e) => setSteer(e.target.value)}
            maxLength={300}
            placeholder="Steer it: only human studies, after 2015…"
            aria-label="Steer the search"
            className="h-9 rounded-full text-snippet"
          />
          <Button type="submit" variant="secondary" size="sm" disabled={steer.trim().length < 2}>
            Steer
          </Button>
        </form>
      )}

      {(answering || saved) && (
        <Reveal className="mt-6 scroll-mb-40">{answerView(answerMessage, active)}</Reveal>
      )}

      {state.end && !answered && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-panel px-4 py-3">
          <p className="flex-1 text-snippet text-silver-mist">
            {state.end.message ?? "The search ended."}
          </p>
          {onRetry && state.end.status !== "stopped" && (
            <Button variant="secondary" size="sm" onClick={() => onRetry(question)}>
              <RotateCcwIcon strokeWidth={1.75} />
              Search again
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

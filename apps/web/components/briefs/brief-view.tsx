"use client"

import type { Citation } from "@konkyo/agents"
import { BRIEF } from "@konkyo/config"
import { Button } from "@konkyo/ui/components/button"
import { cn } from "@konkyo/ui/lib/utils"
import { useMutation, useQuery } from "@tanstack/react-query"
import {
  DownloadIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  RotateCwIcon,
  Trash2Icon,
} from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { CitationChip } from "@/components/chat/citation-chip"
import { MobileHeader } from "@/components/page-header"
import type { Brief } from "@/lib/briefs"
import { api } from "@/lib/fetcher"

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`
const RATES = [1, 1.25, 1.5, 2, 0.75] as const
const VOICE = {
  A: { name: BRIEF.voices.A.name, dot: "bg-voice-a", bar: "bg-voice-a", text: "text-voice-a" },
  B: { name: BRIEF.voices.B.name, dot: "bg-voice-b", bar: "bg-voice-b", text: "text-voice-b" },
} as const

type Line = Brief["lines"][number]

/**
 * An audio brief (plan F37, §7.5 after Around and Krisp): the player with a speaker-coloured scrub
 * bar, speed and download, and the transcript beside it: the line being heard is lit, a timestamp
 * seeks, and each citation opens its passage in the source pane.
 */
export function BriefView({ id }: { id: string }) {
  const { data: brief, isError } = useQuery({
    queryKey: ["brief", id],
    queryFn: () => api<Brief>(`/api/briefs/${id}`),
    refetchInterval: (query) => (query.state.data?.status === "making" ? 2_500 : false),
  })
  return (
    <>
      <MobileHeader title="Audio brief" />
      <div className="mx-auto w-full max-w-3xl px-6 pt-10 pb-24 md:pt-15">
        {isError ? (
          <p className="text-ui text-ash-gray">This brief couldn't be found.</p>
        ) : !brief ? (
          <div className="h-48 animate-pulse rounded-card bg-panel" />
        ) : (
          <>
            <p className="text-micro text-saffron-spark uppercase">Audio brief</p>
            <h1 className="mt-3 text-heading-xs text-balance text-bone-white">{brief.title}</h1>
            {brief.status === "making" && <Making createdAt={brief.createdAt} />}
            {brief.status === "failed" && <Failed brief={brief} />}
            {brief.status === "ready" && brief.audioUrl && <Player brief={brief} />}
          </>
        )}
      </div>
    </>
  )
}

function Making({ createdAt }: { createdAt: string | Date }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const seconds = Math.max(0, Math.round((now - new Date(createdAt).getTime()) / 1000))
  const stages = [
    "Reading the most central passages",
    "Writing two hosts' script, every fact cited",
    "Checking each quote in Zetaris and each line with the Verifier",
    "Recording the two voices",
    "Timing every line against the audio",
  ]
  return (
    <div className="mt-8 rounded-card border border-border bg-panel p-5">
      <p className="text-ui text-bone-white">Making your brief · {clock(seconds)}</p>
      <ol className="mt-3 space-y-1.5">
        {stages.map((s) => (
          <li key={s} className="text-snippet text-ash-gray">
            {s}
          </li>
        ))}
      </ol>
      <p className="mt-4 text-meta text-ash-gray">
        It usually takes under a minute. It lands in your Inbox too, so you can leave this page.
      </p>
    </div>
  )
}

function Failed({ brief }: { brief: Brief }) {
  const router = useRouter()
  const again = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/api/briefs", {
        method: "POST",
        json: brief.folderId ? { folderId: brief.folderId } : { fileIds: brief.scope.fileIds },
      }),
    onSuccess: ({ id }) => router.replace(`/briefs/${id}` as Route),
    onError: (error: Error) => toast.error(error.message),
  })
  return (
    <div className="mt-8 flex flex-wrap items-center gap-3 rounded-card border border-border bg-panel p-5">
      <p className="flex-1 text-snippet text-silver-mist">
        {brief.problem ?? "This brief couldn't be made."}
      </p>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => again.mutate()}
        disabled={again.isPending}
      >
        <RotateCcwIcon strokeWidth={1.75} />
        Try again
      </Button>
    </div>
  )
}

/** Each cited line as an answer's citation, numbered in the order they're heard. */
function citationsOf(lines: Line[]) {
  let n = 0
  return lines.map((l): Citation | null =>
    l.citation
      ? {
          label: "",
          text: "",
          n: ++n,
          state: "verified",
          passageId: l.citation.passageId,
          fileId: l.citation.fileId,
          title: l.citation.title,
          kind: l.citation.kind,
          page: l.citation.page,
          tStart: l.citation.tStart,
          quote: l.citation.quote,
          byline: l.citation.byline,
        }
      : null,
  )
}

function Player({ brief }: { brief: Brief }) {
  const router = useRouter()
  const audio = useRef<HTMLAudioElement>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState<(typeof RATES)[number]>(1)
  const lines = brief.lines
  const duration = brief.durationSeconds ?? lines.at(-1)?.end ?? 0
  const citations = useMemo(() => citationsOf(lines), [lines])
  // The line being heard: the last one that has started.
  const active = lines.reduce((at, l, i) => (time >= l.start - 0.05 ? i : at), -1)

  const seek = (t: number) => {
    const el = audio.current
    if (!el) return
    el.currentTime = Math.max(0, Math.min(duration, t))
    setTime(el.currentTime)
  }
  const toggle = () => {
    const el = audio.current
    if (!el) return
    if (el.paused) void el.play()
    else el.pause()
  }
  useEffect(() => {
    if (audio.current) audio.current.playbackRate = rate
  }, [rate])

  // While it plays, the lit line stays in view.
  const items = useRef<(HTMLLIElement | null)[]>([])
  useEffect(() => {
    if (playing && active >= 0) items.current[active]?.scrollIntoView({ block: "nearest" })
  }, [active, playing])

  const remove = useMutation({
    mutationFn: () => api(`/api/briefs/${brief.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast("Brief deleted")
      router.replace((brief.folderId ? `/library/folders/${brief.folderId}` : "/library") as Route)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const progress = duration ? (time / duration) * 100 : 0
  const segments = lines.map((l, i) => {
    const end = lines[i + 1]?.start ?? duration
    return {
      speaker: l.speaker,
      left: (l.start / duration) * 100,
      width: ((end - l.start) / duration) * 100,
    }
  })
  const cited = citations.filter(Boolean).length

  return (
    <>
      <p className="mt-3 text-snippet text-ash-gray">
        {VOICE.A.name} and {VOICE.B.name} · {clock(duration)} · {cited} cited line
        {cited === 1 ? "" : "s"}, each checked against its passage before it was recorded
        {brief.folderId && (
          <>
            {" · "}
            <Link
              href={`/library/folders/${brief.folderId}` as Route}
              className="underline decoration-white/20 underline-offset-2 hover:text-bone-white"
            >
              Open the folder
            </Link>
          </>
        )}
      </p>

      {/* biome-ignore lint/a11y/useMediaCaption: the transcript below is the caption */}
      <audio
        ref={audio}
        src={brief.audioUrl ?? undefined}
        preload="metadata"
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />

      <div className="sticky top-0 z-10 -mx-6 mt-8 bg-background/90 px-6 py-4 backdrop-blur-md md:top-0">
        <div className="relative h-2.5 rounded-full bg-raised">
          {/* Speaker-coloured spans; the heard part at full strength, the rest dimmed. */}
          {segments.map((s, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: spans follow the fixed line order
              key={i}
              aria-hidden
              className={cn("absolute inset-y-0 opacity-30", VOICE[s.speaker].bar)}
              style={{ left: `${s.left}%`, width: `calc(${s.width}% - 2px)` }}
            />
          ))}
          <div
            aria-hidden
            className="absolute inset-y-0 left-0 overflow-hidden"
            style={{ width: `${progress}%` }}
          >
            <div
              className="relative h-full"
              style={{ width: `${progress ? 10_000 / progress : 0}%` }}
            >
              {segments.map((s, i) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: spans follow the fixed line order
                  key={i}
                  className={cn("absolute inset-y-0", VOICE[s.speaker].bar)}
                  style={{ left: `${s.left}%`, width: `calc(${s.width}% - 2px)` }}
                />
              ))}
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={time}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Position in the brief"
            aria-valuetext={`${clock(time)} of ${clock(duration)}`}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button
            size="icon"
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
            className="rounded-full"
          >
            {playing ? (
              <PauseIcon className="fill-current" />
            ) : (
              <PlayIcon className="fill-current" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => seek(time - 10)}
            aria-label="Back 10 seconds"
          >
            <RotateCcwIcon strokeWidth={1.5} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => seek(time + 10)}
            aria-label="Forward 10 seconds"
          >
            <RotateCwIcon strokeWidth={1.5} />
          </Button>
          <span className="ml-1 text-snippet text-silver-mist tabular-nums">
            {clock(time)} <span className="text-ash-gray">/ {clock(duration)}</span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length] ?? 1)}
            aria-label={`Speed ${rate}×, change`}
            className="ml-auto rounded-full text-snippet tabular-nums"
          >
            {rate}×
          </Button>
          {brief.downloadUrl && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Download the mp3"
              render={<a href={brief.downloadUrl} download />}
              nativeButton={false}
            >
              <DownloadIcon strokeWidth={1.5} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete this brief"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
          >
            <Trash2Icon strokeWidth={1.5} />
          </Button>
        </div>
      </div>

      <ol className="mt-4 space-y-1" aria-label="Transcript">
        {lines.map((line, i) => {
          const voice = VOICE[line.speaker]
          const citation = citations[i]
          return (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: lines are fixed once made
              key={i}
              ref={(el) => {
                items.current[i] = el
              }}
              aria-current={i === active ? "true" : undefined}
              className={cn(
                "grid grid-cols-[3.25rem_1fr] gap-3 rounded-xl px-3 py-3 transition-colors duration-(--duration-press)",
                i === active && "bg-panel",
              )}
            >
              <button
                type="button"
                onClick={() => {
                  seek(line.start)
                  if (audio.current?.paused) void audio.current.play()
                }}
                className="self-start pt-0.5 text-left text-meta text-ash-gray tabular-nums hover:text-bone-white"
                aria-label={`Play from ${clock(line.start)}`}
              >
                {clock(line.start)}
              </button>
              <div>
                <p className={cn("flex items-center gap-1.5 text-meta", voice.text)}>
                  <span className={cn("size-1.5 rounded-full", voice.dot)} aria-hidden />
                  {voice.name}
                </p>
                <p
                  className={cn(
                    "mt-1 text-reading text-pretty transition-colors duration-(--duration-press)",
                    i === active ? "text-bone-white" : "text-silver-mist",
                  )}
                >
                  {line.text}
                  {citation && <CitationChip n={citation.n} citation={citation} />}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </>
  )
}

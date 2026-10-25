"use client"

import type { Citation } from "@konkyo/agents"
import { BRIEF, SPACES } from "@konkyo/config"
import { Button } from "@konkyo/ui/components/button"
import { colorFor } from "@konkyo/ui/lib/space"
import { cn } from "@konkyo/ui/lib/utils"
import { useMutation } from "@tanstack/react-query"
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
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { CitationChip } from "@/components/chat/citation-chip"
import { RoomHeader } from "@/components/page-shell"
import { useRoomWall } from "@/components/shell/wall"
import type { Brief } from "@/lib/briefs"
import { api } from "@/lib/fetcher"
import { useQuery } from "@/lib/use-query"

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`
const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const
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
  // a brief of a space plays on that space's wall
  useRoomWall(brief?.space?.wall ?? null)
  const color = brief?.space
    ? SPACES.colors[brief.space.color ?? colorFor(brief.space.id)].hex
    : "#c9ff3d"
  return (
    <div className="mx-auto w-full max-w-[880px] px-4 pt-4 pb-32 md:px-8 md:pt-[92px]">
      {isError ? (
        <RoomHeader title="brief not found" kicker="audio brief" />
      ) : !brief ? (
        <div className="brief-radio h-56 animate-pulse" />
      ) : (
        <>
          <RoomHeader
            title={brief.title}
            kicker={
              <>
                audio brief
                {brief.durationSeconds ? (
                  <>
                    {" · "}
                    <b>{clock(brief.durationSeconds)}</b>
                  </>
                ) : null}
              </>
            }
            actions={
              <>
                <Link href={"/briefs" as Route} className="room-pill hover:bg-ink">
                  all briefs
                </Link>
                {brief.space && (
                  <Link
                    href={`/spaces/${brief.space.id}` as Route}
                    className="room-pill hover:bg-ink"
                  >
                    {brief.space.name.toLowerCase()} ↗
                  </Link>
                )}
              </>
            }
          />
          {brief.status === "making" && <Making createdAt={brief.createdAt} />}
          {brief.status === "failed" && <Failed brief={brief} />}
          {brief.status === "ready" && brief.audioUrl && <Player brief={brief} color={color} />}
        </>
      )}
    </div>
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
    <div className="brief-radio surface-sticker">
      <p className="text-ui font-bold text-white">Making your brief · {clock(seconds)}</p>
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
    <div className="brief-radio surface-sticker flex flex-wrap items-center gap-3">
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

function Player({ brief, color }: { brief: Brief; color: string }) {
  const router = useRouter()
  const audio = useRef<HTMLAudioElement>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState<(typeof SPEEDS)[number]>(1)
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
      router.replace("/briefs" as Route)
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

      {/* the radio (OurSpaces' room radio): one big play, the time, a scrub bar in the space's
          colour with a tick where the other host takes over, and the speeds as pills */}
      <section
        className="brief-radio surface-sticker"
        aria-label="Player"
        style={{ "--brief": color } as CSSProperties}
      >
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
            className="brief-play"
          >
            {playing ? (
              <PauseIcon className="size-7 fill-current" />
            ) : (
              <PlayIcon className="size-7 translate-x-0.5 fill-current" />
            )}
          </button>
          <div className="min-w-0 flex-1">
            <p className="brief-time tabular-nums">
              {clock(time)} <span>/ {clock(duration)}</span>
            </p>
            <p className="brief-who">
              <span className="brief-voice is-a" /> {VOICE.A.name}
              <span className="brief-voice is-b" /> {VOICE.B.name} · {cited} cited line
              {cited === 1 ? "" : "s"}, each checked before it was recorded
            </p>
          </div>
        </div>

        <div className="brief-scrub">
          <div className="brief-scrub-fill" style={{ width: `${progress}%` }} aria-hidden />
          {segments.slice(1).map((s, i) =>
            s.speaker !== segments[i]?.speaker ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: ticks follow the fixed line order
              <i key={i} className="brief-scrub-tick" style={{ left: `${s.left}%` }} aria-hidden />
            ) : null,
          )}
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={time}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Position in the brief"
            aria-valuetext={`${clock(time)} of ${clock(duration)}`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="brief-pill"
            onClick={() => seek(time - 10)}
            aria-label="Back 10 seconds"
          >
            <RotateCcwIcon className="size-3.5" strokeWidth={2} /> 10
          </button>
          <button
            type="button"
            className="brief-pill"
            onClick={() => seek(time + 10)}
            aria-label="Forward 10 seconds"
          >
            10 <RotateCwIcon className="size-3.5" strokeWidth={2} />
          </button>
          <fieldset className="brief-speeds">
            <legend className="sr-only">Speed</legend>
            {SPEEDS.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={rate === r}
                className={cn("brief-pill", rate === r && "is-on")}
                onClick={() => setRate(r)}
              >
                {r}×
              </button>
            ))}
          </fieldset>
          <span className="ml-auto flex gap-2">
            {brief.downloadUrl && (
              <a
                className="brief-pill"
                href={brief.downloadUrl}
                download
                aria-label="Download the mp3"
              >
                <DownloadIcon className="size-3.5" strokeWidth={2} /> mp3
              </a>
            )}
            <button
              type="button"
              className="brief-pill"
              aria-label="Delete this brief"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
            >
              <Trash2Icon className="size-3.5" strokeWidth={2} />
            </button>
          </span>
        </div>
      </section>

      <ol className="surface-paper brief-transcript" aria-label="Transcript">
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
              className={cn("brief-line", i === active && "is-on")}
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
                <p className="brief-speaker">
                  <span
                    className={cn("brief-voice", line.speaker === "A" ? "is-a" : "is-b")}
                    aria-hidden
                  />
                  {voice.name}
                </p>
                <p
                  className={cn(
                    "mt-1 text-reading text-pretty transition-colors duration-(--duration-press)",
                    i === active ? "text-ink" : "text-[#3a3036]",
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

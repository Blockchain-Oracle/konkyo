"use client"

import { Button } from "@konkyo/ui/components/button"
import { Skeleton } from "@konkyo/ui/components/skeleton"
import { Slider } from "@konkyo/ui/components/slider"
import { cn } from "@konkyo/ui/lib/utils"
import { PauseIcon, PlayIcon } from "lucide-react"
import { type RefObject, useEffect, useMemo, useRef, useState } from "react"
import { clock } from "@/lib/format"
import { type FileDetail, type SourcePassage, usePassages } from "@/lib/use-source"

/** The bits of YouTube's IFrame Player API this viewer uses. */
type YouTubePlayer = {
  getCurrentTime(): number
  seekTo(seconds: number, allowSeekAhead: boolean): void
  playVideo(): void
}
type YouTubeApi = {
  Player: new (
    el: HTMLIFrameElement,
    options: { events: { onStateChange?: (event: { data: number }) => void } },
  ) => YouTubePlayer
}
declare global {
  interface Window {
    YT?: YouTubeApi
    onYouTubeIframeAPIReady?: () => void
  }
}
/** YouTube's "playing" state. */
const YT_PLAYING = 1

let youTubeApi: Promise<YouTubeApi> | null = null
/** YouTube's IFrame Player API, loaded once for the whole app (its documented way in). */
function loadYouTubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  youTubeApi ??= new Promise((resolve) => {
    const before = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      before?.()
      if (window.YT) resolve(window.YT)
    }
    const tag = document.createElement("script")
    tag.src = "https://www.youtube.com/iframe_api"
    tag.async = true
    document.head.append(tag)
  })
  return youTubeApi
}

/** The video id of a YouTube link (watch, youtu.be, shorts or embed). */
function youTubeId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.endsWith("youtu.be")) return u.pathname.slice(1) || null
    return u.searchParams.get("v") ?? u.pathname.match(/\/(?:shorts|embed)\/([\w-]+)/)?.[1] ?? null
  } catch {
    return null
  }
}

/**
 * Recordings and YouTube videos (plan F07): the player on top, the transcript below with the
 * passage being spoken marked. Clicking a passage plays from there; a citation opens at its moment.
 */
export function MediaViewer({
  file,
  target,
}: {
  file: FileDetail
  target?: { seconds?: number; passageId?: string; nonce: number }
}) {
  const { data: passages, isPending } = usePassages(file.id)
  const media = useRef<HTMLMediaElement | null>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const [now, setNow] = useState(0)
  const youtube = file.kind === "youtube" && file.sourceUrl ? youTubeId(file.sourceUrl) : null
  const player = useRef<YouTubePlayer | null>(null)
  const [ytPlaying, setYtPlaying] = useState(false)

  // A YouTube embed follows playback too (gap #7): the IFrame API's player on the same iframe
  // says when it plays, and while it does, its time moves the transcript.
  useEffect(() => {
    if (!youtube || !frame.current) return
    let live = true
    const el = frame.current
    void loadYouTubeApi().then((api) => {
      if (!live) return
      player.current = new api.Player(el, {
        events: { onStateChange: (event) => setYtPlaying(event.data === YT_PLAYING) },
      })
    })
    return () => {
      live = false
      player.current = null
    }
  }, [youtube])
  useEffect(() => {
    if (!ytPlaying) return
    const tick = setInterval(() => {
      const t = player.current?.getCurrentTime()
      if (typeof t === "number") setNow(t)
    }, 250)
    return () => clearInterval(tick)
  }, [ytPlaying])

  const seek = (seconds: number) => {
    if (media.current) {
      media.current.currentTime = seconds
      void media.current.play()
    } else if (player.current) {
      player.current.seekTo(seconds, true)
      player.current.playVideo()
    } else if (frame.current) {
      // YouTube's IFrame API listens for these messages when the embed has enablejsapi=1.
      frame.current.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "seekTo", args: [seconds, true] }),
        "https://www.youtube-nocookie.com",
      )
    }
    setNow(seconds)
  }

  // A citation or link opens at its moment: the passage's start, or the given second.
  const start = useMemo(() => {
    if (!target) return undefined
    if (target.seconds != null) return target.seconds
    return passages?.find((p) => p.id === target.passageId)?.tStart ?? undefined
  }, [target, passages])
  // biome-ignore lint/correctness/useExhaustiveDependencies: seek once per open (nonce), not on every render
  useEffect(() => {
    if (start != null) seek(start)
  }, [start, target?.nonce])

  // The last passage that has started by now (passages are in time order).
  const current = useMemo(() => {
    let found: SourcePassage | undefined
    for (const p of passages ?? []) {
      if (p.tStart != null && p.tStart <= now + 0.25) found = p
      else if (p.tStart != null) break
    }
    return found
  }, [passages, now])
  const list = useRef<HTMLOListElement>(null)
  // Keep the passage being spoken in view without yanking the list while the person scrolls it.
  useEffect(() => {
    if (!current) return
    list.current
      ?.querySelector(`[data-pid="${CSS.escape(current.id)}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [current])

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-muted">
      <div className="shrink-0 border-b border-border p-4">
        {youtube ? (
          <iframe
            ref={frame}
            title={file.title}
            src={`https://www.youtube-nocookie.com/embed/${youtube}?enablejsapi=1&rel=0`}
            className="aspect-video w-full rounded-xl"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : file.kind === "video" && file.mediaUrl ? (
          // biome-ignore lint/a11y/useMediaCaption: the transcript below is the caption track
          <video
            ref={(el) => {
              media.current = el
            }}
            src={file.mediaUrl}
            controls
            className="aspect-video w-full rounded-xl bg-black"
            onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
          />
        ) : file.mediaUrl ? (
          <AudioPlayer
            src={file.mediaUrl}
            title={file.title}
            mediaRef={media}
            now={now}
            onTime={setNow}
          />
        ) : null}
      </div>
      <p className="px-4 pt-4 text-micro text-ash-gray uppercase">Transcript</p>
      {isPending ? (
        <div className="space-y-4 p-4">
          {Array.from({ length: 5 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <ol
          ref={list}
          className="min-h-0 flex-1 overflow-y-auto px-2 pt-2 pb-6"
          data-now={Math.floor(now)}
        >
          {passages?.map((p) => (
            <TranscriptRow
              key={p.id}
              passage={p}
              active={p.id === current?.id}
              cited={p.id === target?.passageId}
              onPlay={() => p.tStart != null && seek(p.tStart)}
            />
          ))}
        </ol>
      )}
    </div>
  )
}

function TranscriptRow({
  passage,
  active,
  cited,
  onPlay,
}: {
  passage: SourcePassage
  active: boolean
  cited: boolean
  onPlay: () => void
}) {
  return (
    <li data-pid={passage.id}>
      <button
        type="button"
        onClick={onPlay}
        className={cn(
          "flex w-full gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors duration-(--duration-press) hover:bg-raised",
          active && "bg-raised",
        )}
      >
        <span className="w-11 shrink-0 pt-0.5 text-snippet text-ash-gray tabular-nums">
          {passage.tStart != null ? clock(passage.tStart) : ""}
        </span>
        <span className="min-w-0 flex-1">
          {passage.speaker && (
            <span className="mb-0.5 block text-meta text-ash-gray">
              {speakerName(passage.speaker)}
            </span>
          )}
          <span
            className={cn(
              "text-reading text-silver-mist",
              active && "text-bone-white",
              // A cited passage gets the same amber mark as in a PDF.
              cited && "bg-highlight box-decoration-clone px-0.5 text-bone-white",
            )}
          >
            {passage.text}
          </span>
        </span>
      </button>
    </li>
  )
}

/** Scribe labels speakers "speaker_0", "speaker_1"…; people read "Speaker 1", "Speaker 2". */
const speakerName = (raw: string) => {
  const n = raw.match(/(\d+)$/)?.[1]
  return n != null ? `Speaker ${Number(n) + 1}` : raw
}

/** A quiet player on the app's own tokens (the browser's controls are a light grey pill). */
function AudioPlayer({
  src,
  title,
  mediaRef,
  now,
  onTime,
}: {
  src: string
  title: string
  mediaRef: RefObject<HTMLMediaElement | null>
  now: number
  onTime: (seconds: number) => void
}) {
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const toggle = () => {
    const el = mediaRef.current
    if (!el) return
    if (el.paused) void el.play()
    else el.pause()
  }
  return (
    <div className="flex items-center gap-3">
      {/* biome-ignore lint/a11y/useMediaCaption: the transcript below is the caption track */}
      <audio
        ref={(el) => {
          mediaRef.current = el
        }}
        src={src}
        preload="metadata"
        onTimeUpdate={(e) => onTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <Button
        size="icon"
        variant="secondary"
        aria-label={playing ? `Pause ${title}` : `Play ${title}`}
        onClick={toggle}
        className="shrink-0"
      >
        {playing ? <PauseIcon className="fill-current" /> : <PlayIcon className="fill-current" />}
      </Button>
      <Slider
        aria-label="Position"
        min={0}
        max={duration || 1}
        step={0.1}
        value={[Math.min(now, duration || 0)]}
        onValueChange={(value) => {
          const seconds = Array.isArray(value) ? (value[0] ?? 0) : value
          if (mediaRef.current) mediaRef.current.currentTime = seconds
          onTime(seconds)
        }}
        className="flex-1"
      />
      <span className="w-20 shrink-0 text-right text-snippet text-ash-gray tabular-nums">
        {clock(now)} / {clock(duration)}
      </span>
    </div>
  )
}

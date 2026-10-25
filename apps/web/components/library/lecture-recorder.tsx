"use client"

import { Button } from "@konkyo/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@konkyo/ui/components/dialog"
import { MicIcon, PauseIcon, PlayIcon, SquareIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useUploads } from "@/components/library/uploads-provider"
import { sound } from "@/lib/sounds"

/**
 * Record a lecture (plan F60's "record a lecture" tile): the browser records the microphone, and
 * the recording goes through the same upload as any file, so it's transcribed with who spoke when,
 * every answer can play the moment it cites, and Make notes works on it (F32). Chrome and Firefox
 * record WebM audio, Safari MP4 audio; both are audio files to Konkyo (.weba, .m4a).
 */
const FORMATS = [
  { mime: "audio/webm;codecs=opus", ext: ".weba" },
  { mime: "audio/webm", ext: ".weba" },
  { mime: "audio/mp4", ext: ".m4a" },
] as const
/** Speech stays clear at this rate: about 22 MB an hour. */
const BITS_PER_SECOND = 48_000
/** The recorder hands over a chunk this often, so a crash loses seconds, not the lecture. */
const CHUNK_MS = 5_000
const BARS = 24

type Phase = "idle" | "asking" | "recording" | "paused" | "saving"

const clock = (seconds: number) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const mm = String(m).padStart(h ? 2 : 1, "0")
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`
}

const titleNow = () =>
  `Lecture, ${new Date().toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })}`

export function LectureRecorder({
  open,
  folderId,
  onClose,
}: {
  open: boolean
  folderId?: string
  onClose: () => void
}) {
  const { upload } = useUploads()
  const [phase, setPhase] = useState<Phase>("idle")
  const [seconds, setSeconds] = useState(0)
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0))
  const [problem, setProblem] = useState<string | null>(null)
  const live = useRef<{
    recorder: MediaRecorder
    stream: MediaStream
    audio: AudioContext
    chunks: Blob[]
    ext: string
    mime: string
    wake?: WakeLockSentinel
    frame: number
    tick: number
  } | null>(null)

  const release = () => {
    const r = live.current
    if (!r) return
    cancelAnimationFrame(r.frame)
    clearInterval(r.tick)
    for (const track of r.stream.getTracks()) track.stop()
    void r.audio.close().catch(() => {})
    void r.wake?.release().catch(() => {})
    live.current = null
  }
  // Closing the page or the app's shell mid-recording lets the microphone go.
  useEffect(() => release, [])

  const start = async () => {
    setProblem(null)
    setPhase("asking")
    const format = FORMATS.find((f) => MediaRecorder.isTypeSupported(f.mime))
    if (!format) {
      setProblem("This browser can't record audio. Record on your phone and upload the file.")
      setPhase("idle")
      return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
    } catch {
      setProblem(
        "Konkyo needs the microphone. Allow it in the browser's address bar and try again.",
      )
      setPhase("idle")
      return
    }
    const recorder = new MediaRecorder(stream, {
      mimeType: format.mime,
      audioBitsPerSecond: BITS_PER_SECOND,
    })
    const audio = new AudioContext()
    const analyser = audio.createAnalyser()
    analyser.fftSize = 64
    audio.createMediaStreamSource(stream).connect(analyser)
    const bins = new Uint8Array(analyser.frequencyBinCount)
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    // A long lecture shouldn't end because the phone's screen went to sleep.
    const wake = await navigator.wakeLock?.request("screen").catch(() => undefined)
    let last = 0
    const draw = (now: number) => {
      if (!live.current) return
      if (now - last > 80) {
        last = now
        analyser.getByteFrequencyData(bins)
        const level = bins.reduce((sum, v) => sum + v, 0) / bins.length / 255
        setLevels((prev) => [...prev.slice(1), recorder.state === "recording" ? level : 0])
      }
      live.current.frame = requestAnimationFrame(draw)
    }
    live.current = {
      recorder,
      stream,
      audio,
      chunks,
      ext: format.ext,
      mime: format.mime.split(";")[0] as string,
      wake,
      frame: requestAnimationFrame(draw),
      tick: window.setInterval(() => {
        if (live.current?.recorder.state === "recording") setSeconds((s) => s + 1)
      }, 1000),
    }
    recorder.start(CHUNK_MS)
    setSeconds(0)
    setPhase("recording")
    sound("promote")
  }

  const pause = () => {
    const r = live.current
    if (!r) return
    if (r.recorder.state === "recording") {
      r.recorder.pause()
      setPhase("paused")
    } else {
      r.recorder.resume()
      setPhase("recording")
    }
    sound("tap")
  }

  const stop = (keep: boolean) => {
    const r = live.current
    if (!r) return
    if (!keep) {
      r.recorder.onstop = null
      r.recorder.stop()
      release()
      setPhase("idle")
      setSeconds(0)
      onClose()
      return
    }
    setPhase("saving")
    r.recorder.onstop = async () => {
      const { chunks, ext, mime } = r
      release()
      const name = `${titleNow()}${ext}`
      try {
        await upload([{ file: new File(chunks, name, { type: mime }) }], folderId)
        sound("place")
        toast.success(`${name.slice(0, -ext.length)} added`, {
          description: "It's being transcribed. Ask it anything, or make notes from it.",
        })
        setPhase("idle")
        setSeconds(0)
        onClose()
      } catch (error) {
        setProblem((error as Error).message)
        setPhase("idle")
      }
    }
    r.recorder.stop()
  }

  const busy = phase === "recording" || phase === "paused" || phase === "saving"
  return (
    <Dialog
      open={open}
      // A lecture is never lost to a stray click or Escape: Stop or Discard ends it.
      onOpenChange={(o) => !o && !busy && onClose()}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={!busy}>
        <DialogTitle className="text-subhead font-normal">Record a lecture</DialogTitle>
        <DialogDescription className="text-ui text-ash-gray">
          It's transcribed with who spoke when, so every answer can play the moment it cites.
        </DialogDescription>

        <div className="mt-2 flex flex-col items-center gap-4 rounded-card border border-border px-5 py-6">
          <p
            className="font-display text-[44px] leading-none font-bold tracking-[-0.03em] text-bone-white tabular-nums"
            aria-live="off"
          >
            {clock(seconds)}
          </p>
          <div className="flex h-10 items-center gap-[3px]" aria-hidden>
            {levels.map((level, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: a fixed row of meter bars
                key={i}
                className="w-1.5 rounded-full bg-bone-white/80 transition-[height] duration-75"
                style={{ height: `${Math.max(4, Math.min(40, level * 90))}px` }}
              />
            ))}
          </div>
          <p className="text-snippet text-ash-gray" role="status">
            {phase === "idle" && "Your browser will ask to use the microphone."}
            {phase === "asking" && "Waiting for the microphone…"}
            {phase === "recording" && "Recording. Keep this tab open; the screen stays on."}
            {phase === "paused" && "Paused."}
            {phase === "saving" && "Adding it to your library…"}
          </p>
        </div>

        {problem && (
          <p className="text-snippet text-contradicts" role="alert">
            {problem}
          </p>
        )}

        <DialogFooter className="gap-2">
          {busy ? (
            <>
              <Button variant="ghost" onClick={() => stop(false)} disabled={phase === "saving"}>
                Discard
              </Button>
              <Button variant="secondary" onClick={pause} disabled={phase === "saving"}>
                {phase === "paused" ? (
                  <PlayIcon strokeWidth={1.75} />
                ) : (
                  <PauseIcon strokeWidth={1.75} />
                )}
                {phase === "paused" ? "Resume" : "Pause"}
              </Button>
              <Button onClick={() => stop(true)} disabled={phase === "saving" || seconds < 1}>
                <SquareIcon strokeWidth={1.75} />
                Stop and add
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={() => void start()} disabled={phase === "asking"}>
                <MicIcon strokeWidth={1.75} />
                Start recording
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

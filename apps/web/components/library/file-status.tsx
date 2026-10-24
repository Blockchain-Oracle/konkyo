"use client"

import { Spinner } from "@konkyo/ui/components/spinner"
import { cn } from "@konkyo/ui/lib/utils"
import { CheckIcon, CircleAlertIcon, ScanTextIcon } from "lucide-react"
import { useEffect, useState } from "react"
import type { LibraryFile } from "@/lib/use-library"
import type { UploadState } from "@/lib/use-uploader"

/** Plain words for each problem (plan F03). */
export const PROBLEM_LABEL: Record<NonNullable<LibraryFile["problem"]>, string> = {
  locked_pdf: "Locked PDF",
  unsupported: "Unsupported",
  unreachable: "Couldn't reach",
  duplicate: "Duplicate",
  no_text: "No readable text",
  failed: "Couldn't process",
}

/**
 * One status per file, each with its own shape so colour is never the only signal (plan §7.7):
 * Ready ✓ (verdant), working (spinner + stage), needs you (alert + what's wrong).
 */
export function FileStatus({ file, upload }: { file: LibraryFile; upload?: UploadState }) {
  if (upload?.failed) {
    return (
      <span className="inline-flex items-center gap-1.5 text-snippet text-contradicts">
        <CircleAlertIcon className="size-3.5" strokeWidth={1.75} aria-hidden />
        Upload failed
      </span>
    )
  }
  if (file.status === "ready") {
    return (
      <span className="inline-flex items-center gap-2 text-snippet">
        <span className="inline-flex items-center gap-1 text-supports-text">
          <CheckIcon className="size-3.5 text-supports" strokeWidth={2.25} aria-hidden />
          Ready
        </span>
        {file.fromScan && (
          <span
            className="inline-flex items-center gap-1 text-ash-gray"
            title="These pages were scans; their text was read by OCR"
          >
            <ScanTextIcon className="size-3.5" strokeWidth={1.5} aria-hidden />
            Text from scan
          </span>
        )}
      </span>
    )
  }
  if (file.status === "needs_you" && file.problem) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-snippet",
          file.problem === "duplicate" ? "text-silver-mist" : "text-contradicts",
        )}
      >
        <CircleAlertIcon className="size-3.5" strokeWidth={1.75} aria-hidden />
        {PROBLEM_LABEL[file.problem]}
      </span>
    )
  }
  const uploading = file.stage === "Uploading"
  const percent = uploading
    ? upload?.percent
    : file.progress != null
      ? Math.round(file.progress * 100)
      : undefined
  return (
    <span
      className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-snippet text-silver-mist"
      aria-live="polite"
    >
      <Spinner className="size-3.5 text-ash-gray" />
      <span className="truncate">{file.stage ?? "Waiting"}</span>
      {percent != null && percent > 0 && (
        <span className="text-ash-gray tabular-nums">{percent}%</span>
      )}
      <Ticking since={file.createdAt} />
    </span>
  )
}

/** SLOW_MS: when a source has been reading this long, say so (plan F46, OurSpaces' 11 s). */
const SLOW_MS = 11_000

/**
 * The time a source has been in the works, ticking (OurSpaces' reading-room timers): real elapsed
 * time since it arrived, then a plain note when it's a slow one.
 */
function Ticking({ since }: { since: string | Date }) {
  const start = new Date(since).getTime()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [])
  const ms = Math.max(0, now - start)
  const shown =
    ms < 60_000
      ? `${(ms / 1000).toFixed(1)}s`
      : `${Math.floor(ms / 60_000)}m ${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}s`
  return (
    <>
      <span className="text-ash-gray tabular-nums">{shown}</span>
      {ms > SLOW_MS && ms < 30 * 60_000 && (
        <span className="text-ash-gray">· slow source, still reading</span>
      )}
    </>
  )
}

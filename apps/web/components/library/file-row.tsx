"use client"

import { Button } from "@konkyo/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@konkyo/ui/components/dropdown-menu"
import { Progress } from "@konkyo/ui/components/progress"
import {
  AudioLinesIcon,
  EllipsisIcon,
  FileCode2Icon,
  FileTextIcon,
  FileTypeIcon,
  FilmIcon,
  GlobeIcon,
  PresentationIcon,
  Trash2Icon,
} from "lucide-react"
import { type LibraryFile, useFileActions } from "@/lib/use-library"
import type { UploadState } from "@/lib/use-uploader"
import { FileStatus } from "./file-status"

const KIND_ICON = {
  pdf: FileTextIcon,
  docx: FileTypeIcon,
  pptx: PresentationIcon,
  markdown: FileCode2Icon,
  text: FileTextIcon,
  web: GlobeIcon,
  audio: AudioLinesIcon,
  video: FilmIcon,
} as const

const KIND_LABEL: Record<LibraryFile["kind"], string> = {
  pdf: "PDF",
  docx: "Word",
  pptx: "Slides",
  markdown: "Markdown",
  text: "Text",
  web: "Web page",
  youtube: "YouTube",
  audio: "Recording",
  video: "Video",
}

function KindIcon({ kind }: { kind: LibraryFile["kind"] }) {
  if (kind === "youtube") {
    // A real logo, not a generic icon (plan §7.9).
    // biome-ignore lint/performance/noImgElement: static brand SVG
    return <img src="/logos/youtube.svg" alt="" className="h-3.5 w-5 object-contain" />
  }
  const Icon = KIND_ICON[kind]
  return <Icon className="size-4 text-ash-gray" strokeWidth={1.5} aria-hidden />
}

const duration = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`

function details(file: LibraryFile): string {
  const parts = [KIND_LABEL[file.kind]]
  if (file.pageCount) parts.push(`${file.pageCount} page${file.pageCount > 1 ? "s" : ""}`)
  if (file.durationSeconds) parts.push(duration(file.durationSeconds))
  parts.push(
    new Date(file.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
  )
  return parts.join(" · ")
}

/** The one action that fixes each problem (plan F03: "each with a fix-it action"). */
function FixIt({
  file,
  onPick,
  onRetryUpload,
}: {
  file: LibraryFile
  onPick: () => void
  onRetryUpload: () => void
}) {
  const { retry, keepExisting, remove } = useFileActions()
  const small = "h-7 px-3 text-snippet"
  if (file.stage === "Uploading") {
    return (
      <Button size="sm" variant="secondary" className={small} onClick={onRetryUpload}>
        Try again
      </Button>
    )
  }
  switch (file.problem) {
    case "duplicate":
      return (
        <Button
          size="sm"
          variant="secondary"
          className={small}
          onClick={() => keepExisting.mutate(file.id)}
        >
          Keep the existing one
        </Button>
      )
    case "locked_pdf":
      return (
        <Button size="sm" variant="secondary" className={small} onClick={onPick}>
          Upload an unlocked copy
        </Button>
      )
    case "unreachable":
      return file.kind === "youtube" ? (
        <Button size="sm" variant="secondary" className={small} onClick={onPick}>
          Upload the video file instead
        </Button>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          className={small}
          onClick={() => retry.mutate(file.id)}
        >
          Try again
        </Button>
      )
    case "unsupported":
      return (
        <Button
          size="sm"
          variant="secondary"
          className={small}
          onClick={() => remove.mutate(file.id)}
        >
          Remove
        </Button>
      )
    case "failed":
      // An upload that never finished has no bytes to retry: it has to be picked again.
      return file.interrupted ? (
        <Button size="sm" variant="secondary" className={small} onClick={onPick}>
          Upload again
        </Button>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          className={small}
          onClick={() => retry.mutate(file.id)}
        >
          Try again
        </Button>
      )
    default:
      return null
  }
}

export function FileRow({
  file,
  upload,
  onRetryUpload,
  onPickReplacement,
}: {
  file: LibraryFile
  upload?: UploadState
  onRetryUpload: () => void
  onPickReplacement: () => void
}) {
  const { remove } = useFileActions()
  const uploading = file.stage === "Uploading" && upload != null && !upload.failed
  const fixIt =
    file.status === "needs_you" || upload?.failed ? (
      <FixIt file={file} onPick={onPickReplacement} onRetryUpload={onRetryUpload} />
    ) : null
  return (
    <li className="group relative flex min-h-16 items-center gap-3 border-b border-border px-2 py-3 transition-colors duration-(--duration-press) hover:bg-panel">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-panel group-hover:bg-raised">
        <KindIcon kind={file.kind} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-ui text-bone-white" title={file.title}>
          {file.title}
        </p>
        <p className="mt-0.5 truncate text-meta text-ash-gray">
          {file.status === "needs_you" && file.problemDetail ? file.problemDetail : details(file)}
        </p>
        {uploading && (
          <Progress
            value={upload?.percent}
            className="mt-1.5 h-0.5 max-w-64"
            aria-label="Upload progress"
          />
        )}
        {/* Phones: status and its fix-it get their own line, so the title keeps its width. */}
        {(file.status !== "ready" || upload?.failed) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:hidden">
            <FileStatus file={file} upload={upload} />
            {fixIt}
          </div>
        )}
      </div>
      <div className="hidden w-56 shrink-0 sm:block">
        <FileStatus file={file} upload={upload} />
      </div>
      {fixIt && <div className="hidden shrink-0 sm:block">{fixIt}</div>}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`More for ${file.title}`}
              className="text-ash-gray hover:text-bone-white"
            />
          }
        >
          <EllipsisIcon strokeWidth={1.5} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem variant="destructive" onClick={() => remove.mutate(file.id)}>
            <Trash2Icon strokeWidth={1.5} />
            Move to Trash
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}

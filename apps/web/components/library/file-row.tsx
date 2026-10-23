"use client"

import { Button } from "@konkyo/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@konkyo/ui/components/dropdown-menu"
import { Progress } from "@konkyo/ui/components/progress"
import {
  DownloadIcon,
  EllipsisIcon,
  FolderInputIcon,
  PanelRightOpenIcon,
  Trash2Icon,
} from "lucide-react"
import { openMoveFiles } from "@/components/shell/app-dialogs"
import { openSource } from "@/lib/preview"
import { type LibraryFile, useFileActions } from "@/lib/use-library"
import type { UploadState } from "@/lib/use-uploader"
import { FileStatus } from "./file-status"
import { KIND_LABEL, KindIcon } from "./kind-icon"

/** The drag payload for library rows (a JSON array of file ids). */
export const FILE_DRAG_TYPE = "application/x-konkyo-files"

const duration = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`

function details(file: LibraryFile): string {
  const parts = [KIND_LABEL[file.kind]]
  if (file.pageCount) parts.push(`${file.pageCount} page${file.pageCount > 1 ? "s" : ""}`)
  if (file.durationSeconds) parts.push(duration(file.durationSeconds))
  parts.push(
    new Date(file.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
  )
  if (file.folderName) parts.push(file.folderName)
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
    <li
      // Rows drag onto a folder in the sidebar to file them there.
      draggable={file.status !== "needs_you" || file.problem === "duplicate"}
      onDragStart={(event) => {
        event.dataTransfer.setData(FILE_DRAG_TYPE, JSON.stringify([file.id]))
        event.dataTransfer.effectAllowed = "move"
      }}
      className="group relative flex min-h-16 items-center gap-3 border-b border-border px-2 py-3 transition-colors duration-(--duration-press) hover:bg-panel"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-panel group-hover:bg-raised">
        <KindIcon kind={file.kind} />
      </span>
      <div className="min-w-0 flex-1">
        {file.status === "ready" ? (
          // The whole row reads as one target: the title button stretches over it (::after).
          <button
            type="button"
            onClick={() => openSource({ fileId: file.id, title: file.title, kind: file.kind })}
            className="block max-w-full truncate text-left text-ui text-bone-white after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:outline-none focus-visible:after:ring-1 focus-visible:after:ring-silver-mist"
            title={file.title}
          >
            {file.title}
          </button>
        ) : (
          <p className="truncate text-ui text-bone-white" title={file.title}>
            {file.title}
          </p>
        )}
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
              className="relative z-10 text-ash-gray hover:text-bone-white"
            />
          }
        >
          <EllipsisIcon strokeWidth={1.5} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {file.status === "ready" && (
            <DropdownMenuItem
              onClick={() => openSource({ fileId: file.id, title: file.title, kind: file.kind })}
            >
              <PanelRightOpenIcon strokeWidth={1.5} />
              Open
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => openMoveFiles([file.id])}>
            <FolderInputIcon strokeWidth={1.5} />
            Move to…
          </DropdownMenuItem>
          {file.status === "ready" && (
            <DropdownMenuItem
              render={
                // Uploaded files download as uploaded; imported pages as their saved PDF.
                <a
                  href={`/api/files/${file.id}/content?as=${file.sourceUrl ? "rendition" : "original"}&download=1`}
                  download
                />
              }
            >
              <DownloadIcon strokeWidth={1.5} />
              {file.sourceUrl ? "Download PDF" : "Download"}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => remove.mutate(file.id)}>
            <Trash2Icon strokeWidth={1.5} />
            Move to Trash
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}

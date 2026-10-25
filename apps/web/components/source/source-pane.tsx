"use client"

import { Button } from "@konkyo/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@konkyo/ui/components/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@konkyo/ui/components/tooltip"
import { cn } from "@konkyo/ui/lib/utils"
import {
  DownloadIcon,
  GraduationCapIcon,
  InfoIcon,
  NotebookPenIcon,
  PanelRightCloseIcon,
  XIcon,
} from "lucide-react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useMemo } from "react"
import { openDetails } from "@/components/library/file-details"
import { KindIcon } from "@/components/library/kind-icon"
import { closeAllSources, closeSource, type SourceTab, showSource, usePreview } from "@/lib/preview"
import { useSourceAccess } from "@/lib/source-access"
import { useFileDetail, usePassage } from "@/lib/use-source"
import { useStudyActions } from "@/lib/use-study"
import { CitedBar } from "./cited-bar"
import { MediaViewer } from "./media-viewer"

// PDFium runs as WebAssembly in a worker: load the viewer only in the browser, only when needed.
const PdfViewer = dynamic(() => import("./pdf-viewer").then((m) => m.PdfViewer), {
  ssr: false,
  loading: () => <div className="flex-1 bg-muted" />,
})

/** The right pane (plan §7.3): every open source as a tab, the active one below. */
export function SourcePane({ className }: { className?: string }) {
  const { tabs, active } = usePreview()
  const { owner } = useSourceAccess()
  if (!active) return null
  return (
    // Reading happens on paper (R4): the pane is a cream card floating beside the room (R1).
    <section
      aria-label="Source"
      className={cn("surface-paper source-sheet flex min-h-0 flex-col", className)}
    >
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border pr-2 pl-2">
        <div
          role="tablist"
          aria-label="Open sources"
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]"
        >
          {tabs.map((tab) => (
            <SourceTabButton key={tab.fileId} tab={tab} active={tab.fileId === active.fileId} />
          ))}
        </div>
        {owner && active.kind !== "note" && <StudyMenu tab={active} />}
        {!owner && <VisitorDownload fileId={active.fileId} />}
        {owner && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Details"
                  onClick={() => openDetails(active.fileId)}
                  className="shrink-0 text-ash-gray hover:text-bone-white"
                />
              }
            >
              <InfoIcon strokeWidth={1.5} />
            </TooltipTrigger>
            <TooltipContent>Details</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close the source pane"
                onClick={closeAllSources}
                className="shrink-0 text-ash-gray hover:text-bone-white"
              />
            }
          >
            <PanelRightCloseIcon strokeWidth={1.5} />
          </TooltipTrigger>
          <TooltipContent>Close the source pane</TooltipContent>
        </Tooltip>
      </header>
      {/* Keyed by file: switching tabs opens that document fresh. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <SourceBody key={active.fileId} tab={active} />
        {owner && active.target?.cited && (
          <CitedBar
            key={active.target.nonce}
            messageId={active.target.cited.messageId}
            n={active.target.cited.n}
          />
        )}
      </div>
    </section>
  )
}

function SourceTabButton({ tab, active }: { tab: SourceTab; active: boolean }) {
  return (
    <div
      className={cn(
        "group flex h-8 max-w-56 min-w-0 shrink-0 items-center rounded-full pr-1 pl-3 transition-colors duration-(--duration-press)",
        active
          ? "bg-raised text-bone-white"
          : "text-ash-gray hover:bg-raised/60 hover:text-silver-mist",
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={active}
        onClick={() => showSource(tab.fileId)}
        className="flex min-w-0 items-center gap-2 rounded-full text-snippet outline-none focus-visible:ring-1 focus-visible:ring-silver-mist focus-visible:ring-offset-4 focus-visible:ring-offset-raised"
        title={tab.title}
      >
        <KindIcon kind={tab.kind} className="size-3.5 shrink-0" />
        <span className="truncate">{tab.title}</span>
      </button>
      <button
        type="button"
        aria-label={`Close ${tab.title}`}
        onClick={() => closeSource(tab.fileId)}
        className="ml-1 grid size-6 shrink-0 place-items-center rounded-full text-ash-gray opacity-0 transition-opacity duration-(--duration-press) group-hover:opacity-100 hover:bg-black/8 hover:text-bone-white focus-visible:opacity-100 group-has-[[aria-selected=true]]:opacity-100"
      >
        <XIcon className="size-3.5" strokeWidth={1.75} />
      </button>
    </div>
  )
}

function SourceBody({ tab }: { tab: SourceTab }) {
  const { data: file, isPending, isError, error } = useFileDetail(tab.fileId)
  const { data: passage } = usePassage(tab.target?.passageId)
  const pdfTarget = useMemo(
    () =>
      tab.target
        ? { page: tab.target.page, passage, quote: tab.target.quote, nonce: tab.target.nonce }
        : undefined,
    [tab.target, passage],
  )

  if (isPending) return <div className="flex-1 bg-muted" />
  if (isError || !file)
    return (
      <p className="grid flex-1 place-items-center p-6 text-center text-ui text-ash-gray">
        {(error as Error | null)?.message ?? "This source couldn't be opened."}
      </p>
    )
  if (file.status !== "ready")
    return (
      <p className="grid flex-1 place-items-center p-6 text-center text-ui text-ash-gray">
        This file is still being read. It opens here once it's ready.
      </p>
    )
  if (file.kind === "audio" || file.kind === "video" || file.kind === "youtube")
    return <MediaViewer file={file} target={tab.target} />
  if (!file.renditionUrl)
    return (
      <p className="grid flex-1 place-items-center p-6 text-center text-ui text-ash-gray">
        There's no readable copy of this file yet. Try re-processing it.
      </p>
    )
  // A cited passage waits for its boxes, so the viewer jumps once instead of twice.
  if (tab.target?.passageId && !passage) return <div className="flex-1 bg-muted" />
  return (
    <PdfViewer url={file.renditionUrl} fileId={file.id} title={file.title} target={pdfTarget} />
  )
}

/** A public folder's file, when its owner lets visitors download (plan F36). */
function VisitorDownload({ fileId }: { fileId: string }) {
  const { data: file } = useFileDetail(fileId)
  if (!file?.downloadUrl) return null
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Download"
            render={<a href={file.downloadUrl} download />}
            nativeButton={false}
            className="shrink-0 text-ash-gray hover:text-bone-white"
          />
        }
      >
        <DownloadIcon strokeWidth={1.5} />
      </TooltipTrigger>
      <TooltipContent>Download</TooltipContent>
    </Tooltip>
  )
}

/** Quiz me and Make notes on the open source (plan F27, F32). */
function StudyMenu({ tab }: { tab: SourceTab }) {
  const study = useStudyActions()
  const router = useRouter()
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Study this"
                  className="shrink-0 text-ash-gray hover:text-bone-white"
                />
              }
            />
          }
        >
          <GraduationCapIcon strokeWidth={1.5} />
        </TooltipTrigger>
        <TooltipContent>Study this</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          onClick={() =>
            void study.quizMe({ fileIds: [tab.fileId], folderIds: [] }, undefined, (href) =>
              router.push(href),
            )
          }
        >
          <GraduationCapIcon strokeWidth={1.5} />
          Quiz me
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            void study.makeNotes({ id: tab.fileId, title: tab.title }, (href) => router.push(href))
          }
        >
          <NotebookPenIcon strokeWidth={1.5} />
          Make notes
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

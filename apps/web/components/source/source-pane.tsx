"use client"

import { Button } from "@konkyo/ui/components/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@konkyo/ui/components/tooltip"
import { cn } from "@konkyo/ui/lib/utils"
import { InfoIcon, PanelRightCloseIcon, XIcon } from "lucide-react"
import dynamic from "next/dynamic"
import { useMemo } from "react"
import { openDetails } from "@/components/library/file-details"
import { KindIcon } from "@/components/library/kind-icon"
import { closeAllSources, closeSource, type SourceTab, showSource, usePreview } from "@/lib/preview"
import { useFileDetail, usePassage } from "@/lib/use-source"
import { CitedBar } from "./cited-bar"
import { MediaViewer } from "./media-viewer"

// PDFium runs as WebAssembly in a worker: load the viewer only in the browser, only when needed.
const PdfViewer = dynamic(() => import("./pdf-viewer").then((m) => m.PdfViewer), {
  ssr: false,
  loading: () => <div className="flex-1 bg-panel" />,
})

/** The right pane (plan §7.3): every open source as a tab, the active one below. */
export function SourcePane({ className }: { className?: string }) {
  const { tabs, active } = usePreview()
  if (!active) return null
  return (
    <section aria-label="Source" className={cn("flex h-full min-h-0 flex-col bg-panel", className)}>
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
        {active.target?.cited && (
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
        className="ml-1 grid size-6 shrink-0 place-items-center rounded-full text-ash-gray opacity-0 transition-opacity duration-(--duration-press) group-hover:opacity-100 hover:bg-white/8 hover:text-bone-white focus-visible:opacity-100 group-has-[[aria-selected=true]]:opacity-100"
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

  if (isPending) return <div className="flex-1 bg-panel" />
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
  if (tab.target?.passageId && !passage) return <div className="flex-1 bg-panel" />
  return (
    <PdfViewer url={file.renditionUrl} fileId={file.id} title={file.title} target={pdfTarget} />
  )
}

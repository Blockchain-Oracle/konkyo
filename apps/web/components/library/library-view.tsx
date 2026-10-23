"use client"

import { ACCEPT } from "@konkyo/config"
import { Button } from "@konkyo/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@konkyo/ui/components/dropdown-menu"
import { Skeleton } from "@konkyo/ui/components/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@konkyo/ui/components/toggle-group"
import { cn } from "@konkyo/ui/lib/utils"
import { ChevronDownIcon, FolderUpIcon, LinkIcon, UploadIcon } from "lucide-react"
import { type DragEvent, useEffect, useMemo, useRef, useState } from "react"
import { EmptyState } from "@/components/empty-state"
import { type LibraryFile, useFiles } from "@/lib/use-library"
import { filesFromDrop, filesFromInput, useUploader } from "@/lib/use-uploader"
import { FileRow } from "./file-row"
import { ImportDialog } from "./import-dialog"

type Filter = "all" | "working" | "ready" | "needs_you"

const FILTERS: { value: Filter; label: string; match: (f: LibraryFile) => boolean }[] = [
  { value: "all", label: "All", match: () => true },
  {
    value: "working",
    label: "Processing",
    match: (f) => f.status === "queued" || f.status === "processing",
  },
  { value: "ready", label: "Ready", match: (f) => f.status === "ready" },
  { value: "needs_you", label: "Needs you", match: (f) => f.status === "needs_you" },
]

/** Library (plan F01–F03): drop anything anywhere, watch each file get read, fix what needs you. */
export function LibraryView({ title }: { title: string }) {
  const { data: files, isPending } = useFiles()
  const { upload, uploads, retryUpload } = useUploader()
  const [filter, setFilter] = useState<Filter>("all")
  const [dragging, setDragging] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const filesInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)

  // Folder picking needs the non-standard attribute, which React doesn't type.
  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "")
  }, [])

  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map((f) => [f.value, files?.filter(f.match).length ?? 0]),
      ) as Record<Filter, number>,
    [files],
  )
  const visible = useMemo(
    () => files?.filter(FILTERS.find((f) => f.value === filter)?.match ?? (() => true)) ?? [],
    [files, filter],
  )

  const onDragOver = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes("Files")) return
    event.preventDefault()
    setDragging(true)
  }
  const onDrop = async (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    await upload(await filesFromDrop(event.dataTransfer))
  }

  const hasFiles = (files?.length ?? 0) > 0

  return (
    <section
      aria-label="Library"
      className="relative min-h-[60vh]"
      onDragOver={onDragOver}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <input
        ref={filesInput}
        type="file"
        multiple
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          void upload(filesFromInput(e.currentTarget.files))
          e.currentTarget.value = ""
        }}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          void upload(filesFromInput(e.currentTarget.files))
          e.currentTarget.value = ""
        }}
      />

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="hidden text-heading-2xs font-normal md:block">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" onClick={() => setImportOpen(true)}>
            <LinkIcon strokeWidth={1.5} />
            Import by URL
          </Button>
          <div className="flex">
            <Button className="rounded-r-none pr-3" onClick={() => filesInput.current?.click()}>
              <UploadIcon strokeWidth={1.75} />
              Upload
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    className="rounded-l-none border-l border-black/20 px-2"
                    aria-label="More upload options"
                  />
                }
              >
                <ChevronDownIcon strokeWidth={1.75} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => filesInput.current?.click()}>
                  <UploadIcon strokeWidth={1.5} />
                  Upload files
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => folderInput.current?.click()}>
                  <FolderUpIcon strokeWidth={1.5} />
                  Upload a folder
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {isPending ? (
        <ul className="mt-9" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
            <li key={i} className="flex h-16 items-center gap-3 border-b border-border px-2">
              <Skeleton className="size-8 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-2/5" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </li>
          ))}
        </ul>
      ) : hasFiles ? (
        <>
          <ToggleGroup
            value={[filter]}
            onValueChange={(value: string[]) => setFilter((value[0] as Filter) ?? "all")}
            // On phones the pills scroll sideways, edge to edge, instead of being cut off.
            className="-mx-6 mt-9 max-w-[calc(100%+3rem)] overflow-x-auto px-6 [scrollbar-width:none] sm:mx-0 sm:max-w-full sm:px-0"
            aria-label="Show"
          >
            {FILTERS.map((f) => (
              <ToggleGroupItem
                key={f.value}
                value={f.value}
                className="h-8 shrink-0 rounded-full px-3 text-snippet"
              >
                {f.label}
                <span className="ml-1.5 text-ash-gray tabular-nums">{counts[f.value]}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <ul className="mt-4.5 border-t border-border">
            {visible.map((file) => (
              <FileRow
                key={file.id}
                file={file}
                upload={uploads[file.id]}
                onRetryUpload={() => retryUpload(file.id)}
                onPickReplacement={() => filesInput.current?.click()}
              />
            ))}
          </ul>
          {visible.length === 0 && <p className="mt-9 text-ui text-ash-gray">Nothing here.</p>}
        </>
      ) : (
        <div className="mt-15">
          <EmptyState
            label="Your library"
            title="Drop files or a folder anywhere"
            description="PDFs, Word, slides, Markdown, recordings, web pages and YouTube links. Every file is read, checked into Zetaris and ready to cite."
          >
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => filesInput.current?.click()}>
                <UploadIcon strokeWidth={1.5} />
                Upload files
              </Button>
              <Button variant="ghost" onClick={() => folderInput.current?.click()}>
                <FolderUpIcon strokeWidth={1.5} />
                Upload a folder
              </Button>
              <Button variant="ghost" onClick={() => setImportOpen(true)}>
                <LinkIcon strokeWidth={1.5} />
                Import by URL
              </Button>
            </div>
          </EmptyState>
        </div>
      )}

      {/* Drop anywhere: the whole view becomes the target. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none fixed inset-0 z-50 grid place-items-center bg-black/70 opacity-0 transition-opacity duration-(--duration-menu)",
          dragging && "opacity-100",
        )}
      >
        <div className="rounded-card border border-dashed border-line-strong bg-panel px-12 py-10 text-center">
          <p className="text-subhead text-bone-white">Drop to add to your library</p>
          <p className="mt-1.5 text-snippet text-ash-gray">Files and whole folders</p>
        </div>
      </div>

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </section>
  )
}

"use client"

import { Button } from "@konkyo/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@konkyo/ui/components/dropdown-menu"
import { Skeleton } from "@konkyo/ui/components/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@konkyo/ui/components/toggle-group"
import { cn } from "@konkyo/ui/lib/utils"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  DownloadIcon,
  EllipsisIcon,
  FolderIcon,
  FolderPlusIcon,
  FolderUpIcon,
  GlobeIcon,
  GraduationCapIcon,
  HeadphonesIcon,
  LinkIcon,
  MessageSquareIcon,
  PencilIcon,
  PlugIcon,
  TelescopeIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { type DragEvent, useEffect, useMemo, useRef, useState } from "react"
import { FolderBriefs } from "@/components/briefs/folder-briefs"
import { EmptyState } from "@/components/empty-state"
import { StudyStarter } from "@/components/onboarding/study-starter"
import {
  openConnectorImport,
  openImport,
  openNewFolder,
  openRenameFolder,
  openShareFolder,
} from "@/components/shell/app-dialogs"
import { chatWithHref } from "@/lib/focus"
import { holdQuestion } from "@/lib/pending-question"
import { useMakeBrief } from "@/lib/use-briefs"
import { useFolderActions, useFolderPath, useFolderTree } from "@/lib/use-folders"
import { type LibraryFile, useFiles } from "@/lib/use-library"
import { useStudyActions } from "@/lib/use-study"
import { filesFromDrop } from "@/lib/use-uploader"
import { BulkBar } from "./bulk-bar"
import { FileRow } from "./file-row"
import { useUploads } from "./uploads-provider"

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

/**
 * Library (plan F01–F05): the whole library, or one folder with its subfolders. Drop anything
 * anywhere, watch each file get read, fix what needs you, file things into folders.
 */
export function LibraryView({ folderId }: { folderId?: string }) {
  const { data: files, isPending } = useFiles(folderId)
  const { pickFiles, pickFolder, upload, uploads, retryUpload } = useUploads()
  const { folders } = useFolderTree()
  const [filter, setFilter] = useState<Filter>("all")
  const [dragging, setDragging] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [selectMode, setSelectMode] = useState(false) // phones: no hover to reveal checkboxes
  const anchor = useRef<string | null>(null)

  const subfolders = useMemo(
    () => (folderId ? (folders ?? []).filter((f) => f.parentId === folderId) : []),
    [folders, folderId],
  )
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

  // A new folder or filter starts a new selection; Esc clears it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the view changes
  useEffect(() => {
    setSelected(new Set())
    setSelectMode(false)
  }, [folderId, filter])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selected.size) {
        setSelected(new Set())
        setSelectMode(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selected])

  /** Click toggles one row; Shift+click selects every row between it and the last one clicked. */
  const toggle = (id: string, shiftKey: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      const ids = visible.map((f) => f.id)
      const from = anchor.current ? ids.indexOf(anchor.current) : -1
      const to = ids.indexOf(id)
      if (shiftKey && from !== -1 && to !== -1) {
        const [a, b] = from < to ? [from, to] : [to, from]
        for (const rid of ids.slice(a, b + 1)) next.add(rid)
      } else if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    anchor.current = id
  }
  const clearSelection = () => {
    setSelected(new Set())
    setSelectMode(false)
  }
  const selecting = selected.size > 0 || selectMode

  // Files from the desktop, not rows dragged within the app.
  const onDragOver = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes("Files")) return
    event.preventDefault()
    setDragging(true)
  }
  const onDrop = async (event: DragEvent) => {
    if (!event.dataTransfer.types.includes("Files")) return
    event.preventDefault()
    setDragging(false)
    await upload(await filesFromDrop(event.dataTransfer), folderId)
  }

  const isEmpty = !isPending && !files?.length && !subfolders.length

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
      <header className="flex flex-wrap items-center gap-3">
        {folderId ? (
          <FolderHeading folderId={folderId} />
        ) : (
          <h1 className="hidden text-heading-2xs font-normal md:block">Library</h1>
        )}
        <div className="ml-auto flex items-center gap-2">
          {(files?.length ?? 0) > 0 && (
            <Button
              variant="ghost"
              className="md:hidden"
              aria-pressed={selectMode}
              onClick={() => (selectMode ? clearSelection() : setSelectMode(true))}
            >
              {selectMode ? "Done" : "Select"}
            </Button>
          )}
          <Button variant="ghost" onClick={() => openImport(folderId)}>
            <LinkIcon strokeWidth={1.5} />
            <span className="max-sm:sr-only">Import by URL</span>
          </Button>
          <div className="flex">
            <Button className="rounded-r-none pr-3" onClick={() => pickFiles(folderId)}>
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
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => pickFiles(folderId)}>
                  <UploadIcon strokeWidth={1.5} />
                  Upload files
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => pickFolder(folderId)}>
                  <FolderUpIcon strokeWidth={1.5} />
                  Upload a folder
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openImport(folderId)}>
                  <LinkIcon strokeWidth={1.5} />
                  Import by URL
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openConnectorImport({ folderId })}>
                  <PlugIcon strokeWidth={1.5} />
                  Gmail, Drive, Notion
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => openNewFolder(folderId)}>
                  <FolderPlusIcon strokeWidth={1.5} />
                  New folder
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
      ) : isEmpty ? (
        <div className="mt-15">
          <EmptyState
            label={folderId ? "This folder" : "Your library"}
            title={folderId ? "This folder is empty" : "Drop files or a folder anywhere"}
            description={
              folderId
                ? "Drop files here, or move files in from the library. Chat with this folder once it has a few."
                : "PDFs, Word, slides, Markdown, recordings, web pages and YouTube links. Every file is read, checked into Zetaris and ready to cite."
            }
          >
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => pickFiles(folderId)}>
                <UploadIcon strokeWidth={1.5} />
                Upload files
              </Button>
              <Button variant="ghost" onClick={() => pickFolder(folderId)}>
                <FolderUpIcon strokeWidth={1.5} />
                Upload a folder
              </Button>
              <Button variant="ghost" onClick={() => openImport(folderId)}>
                <LinkIcon strokeWidth={1.5} />
                Import by URL
              </Button>
            </div>
          </EmptyState>
        </div>
      ) : (
        <>
          {folderId && <FolderBriefs folderId={folderId} />}
          {folderId && (
            <StudyStarter
              folderId={folderId}
              title={folders?.find((f) => f.id === folderId)?.name ?? "Sample course"}
            />
          )}
          {(files?.length ?? 0) > 0 && (
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
          )}
          <ul className={cn("border-t border-border", files?.length ? "mt-4.5" : "mt-9")}>
            {filter === "all" &&
              subfolders.map((folder) => <SubfolderRow key={folder.id} folder={folder} />)}
            {visible.map((file) => (
              <FileRow
                key={file.id}
                file={file}
                upload={uploads[file.id]}
                onRetryUpload={() => retryUpload(file.id)}
                onPickReplacement={() => pickFiles(folderId)}
                selected={selected.has(file.id)}
                selecting={selecting}
                onSelect={({ shiftKey }) => toggle(file.id, shiftKey)}
              />
            ))}
          </ul>
          {visible.length === 0 && filter !== "all" && (
            <p className="mt-9 text-ui text-ash-gray">Nothing here.</p>
          )}
        </>
      )}

      {selected.size > 0 && <BulkBar ids={[...selected]} onClear={clearSelection} />}

      {/* Drop anywhere: the whole view becomes the target. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none fixed inset-0 z-50 grid place-items-center bg-black/70 opacity-0 transition-opacity duration-(--duration-menu)",
          dragging && "opacity-100",
        )}
      >
        <div className="rounded-card border border-dashed border-line-strong bg-panel px-12 py-10 text-center">
          <p className="text-subhead text-bone-white">
            Drop to add to {folderId ? "this folder" : "your library"}
          </p>
          <p className="mt-1.5 text-snippet text-ash-gray">Files and whole folders</p>
        </div>
      </div>
    </section>
  )
}

/** "Library / Sleep papers / slides", with the folder's own actions beside it. */
function FolderHeading({ folderId }: { folderId: string }) {
  const { data: path } = useFolderPath(folderId)
  const { trash } = useFolderActions()
  const study = useStudyActions()
  const makeBrief = useMakeBrief()
  const router = useRouter()
  // A deep search on the folder's topic, in a chat focused on it; what's found lands here (F18).
  const findSourcesFor = (folder: { id: string; name: string }) => {
    const chatId = crypto.randomUUID()
    holdQuestion(chatId, {
      text: `Find more sources on ${folder.name}`,
      deep: true,
      focus: { fileIds: [], folderIds: [folder.id] },
      intoFolderId: folder.id,
    })
    router.push(`/chats/${chatId}` as Route)
  }
  const folder = path?.at(-1)
  return (
    <div className="flex min-w-0 items-center gap-1">
      <nav aria-label="Folder path" className="flex min-w-0 items-center gap-1 text-ui">
        <Link href="/library" className="shrink-0 text-ash-gray hover:text-bone-white">
          Library
        </Link>
        {path?.map((p, i) => (
          <span key={p.id} className="flex min-w-0 items-center gap-1">
            <ChevronRightIcon className="size-3.5 shrink-0 text-ash-gray" strokeWidth={1.5} />
            {i === path.length - 1 ? (
              <h1 className="truncate text-heading-2xs font-normal text-bone-white">{p.name}</h1>
            ) : (
              <Link
                href={`/library/folders/${p.id}`}
                className="truncate text-ash-gray hover:text-bone-white"
              >
                {p.name}
              </Link>
            )}
          </span>
        ))}
      </nav>
      {folder && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`More for ${folder.name}`}
                className="text-ash-gray hover:text-bone-white"
              />
            }
          >
            <EllipsisIcon strokeWidth={1.5} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem
              onClick={() => router.push(chatWithHref({ type: "folder", id: folder.id }) as Route)}
            >
              <MessageSquareIcon strokeWidth={1.5} />
              Chat with this folder
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => findSourcesFor(folder)}>
              <TelescopeIcon strokeWidth={1.5} />
              Find sources on this topic
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                void study.quizMe({ fileIds: [], folderIds: [folder.id] }, folder.name, (href) =>
                  router.push(href),
                )
              }
            >
              <GraduationCapIcon strokeWidth={1.5} />
              Quiz me on this folder
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => makeBrief.mutate(folder.id)}>
              <HeadphonesIcon strokeWidth={1.5} />
              Make an audio brief
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openShareFolder(folder.id, folder.name)}>
              <GlobeIcon strokeWidth={1.5} />
              Share…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openRenameFolder(folder.id, folder.name)}>
              <PencilIcon strokeWidth={1.5} />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openNewFolder(folder.id)}>
              <FolderPlusIcon strokeWidth={1.5} />
              New folder inside
            </DropdownMenuItem>
            <DropdownMenuItem
              render={
                <a href={`/api/files/archive?folder=${folder.id}`} download>
                  Download as .zip
                </a>
              }
            >
              <DownloadIcon strokeWidth={1.5} />
              Download as .zip
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() =>
                trash.mutate(
                  { id: folder.id, name: folder.name },
                  {
                    onSuccess: () => {
                      const parent = path?.at(-2)
                      router.push(parent ? `/library/folders/${parent.id}` : "/library")
                    },
                  },
                )
              }
            >
              <Trash2Icon strokeWidth={1.5} />
              Move to Trash
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

function SubfolderRow({ folder }: { folder: { id: string; name: string; fileCount: number } }) {
  return (
    <li className="relative flex min-h-16 items-center gap-3 border-b border-border px-2 py-3 transition-colors duration-(--duration-press) hover:bg-panel">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-panel">
        <FolderIcon className="size-4 text-ash-gray" strokeWidth={1.5} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <Link
          href={`/library/folders/${folder.id}`}
          className="block truncate text-ui text-bone-white after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
        >
          {folder.name}
        </Link>
        <p className="mt-0.5 text-meta text-ash-gray">
          Folder · {folder.fileCount} file{folder.fileCount === 1 ? "" : "s"}
        </p>
      </div>
    </li>
  )
}

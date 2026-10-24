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
  DownloadIcon,
  FolderIcon,
  FolderPlusIcon,
  FolderUpIcon,
  GlobeIcon,
  GraduationCapIcon,
  HeadphonesIcon,
  LinkIcon,
  MessageSquareIcon,
  PencilIcon,
  TelescopeIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { type DragEvent, useEffect, useMemo, useRef, useState } from "react"
import { FolderBriefs } from "@/components/briefs/folder-briefs"
import { EmptyState } from "@/components/empty-state"
import { StudyStarter } from "@/components/onboarding/study-starter"
import { RoomHeader } from "@/components/page-shell"
import { InviteButton } from "@/components/people/invite-popover"
import {
  openImport,
  openNewFolder,
  openRenameFolder,
  openShareFolder,
} from "@/components/shell/app-dialogs"
import { SpaceChat } from "@/components/spaces/space-chat"
import { chatWithHref } from "@/lib/focus"
import { holdQuestion } from "@/lib/pending-question"
import { sound } from "@/lib/sounds"
import { useMakeBrief } from "@/lib/use-briefs"
import { useFolderActions, useFolderPath, useFolderTree } from "@/lib/use-folders"
import { type LibraryFile, useFiles } from "@/lib/use-library"
import { useSpaceList } from "@/lib/use-spaces"
import { useStudyActions } from "@/lib/use-study"
import { filesFromDrop } from "@/lib/use-uploader"
import { AddPicker } from "../shell/add-picker"
import { BulkBar } from "./bulk-bar"
import { FileRow } from "./file-row"
import { SpaceEdit } from "./space-edit"
import { SpaceShelf } from "./space-shelf"
import { SpaceWall } from "./space-wall"
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
export function LibraryView({ folderId, space = false }: { folderId?: string; space?: boolean }) {
  const { data: files, isPending } = useFiles(folderId)
  const router = useRouter()
  const params = useSearchParams()
  // A space opens as its wall; "list" is the same files as rows (plan F46 wall · list).
  const view: "wall" | "list" = space && params.get("view") !== "list" ? "wall" : "list"
  const spaceRow = useSpaceList().data?.find((s) => s.id === folderId)
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

  const path = useFolderPath(folderId ?? "").data
  const here = folderId ? path?.at(-1) : undefined
  // A top-level folder is a space: its old folder address opens the space.
  useEffect(() => {
    if (!space && folderId && path?.length === 1) router.replace(`/spaces/${folderId}` as Route)
  }, [space, folderId, path, router])

  return (
    <section
      aria-label="Library"
      className="relative"
      onDragOver={onDragOver}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <RoomHeader
        title={folderId ? (spaceRow?.name ?? here?.name ?? "…").toLowerCase() : "library"}
        handles={
          space && spaceRow ? (
            <>
              {spaceRow.role === "owner" && <SpaceEdit space={spaceRow} />}
              <Link
                href={`/spaces/${spaceRow.id}/knows` as Route}
                className="space-knows-chip"
                onClick={() => sound("tap")}
              >
                this space knows ↗
              </Link>
            </>
          ) : undefined
        }
        kicker={
          space ? (
            <>
              <span aria-hidden>{`${spaceRow?.symbol ?? "✦"}\uFE0E`}</span> space ·{" "}
              <b>{spaceRow?.sources ?? counts.all}</b> sources
            </>
          ) : folderId ? (
            <FolderPath folderId={folderId} />
          ) : (
            <>
              <b>{counts.all}</b> sources · {counts.ready} ready
              {counts.needs_you ? ` · ${counts.needs_you} need you` : ""}
            </>
          )
        }
        actions={
          <>
            {space && (
              <nav aria-label="View" className="flex rounded-full bg-sticker p-1">
                {(["wall", "list"] as const).map((v) => (
                  <Link
                    key={v}
                    href={
                      (v === "wall"
                        ? `/spaces/${folderId}`
                        : `/spaces/${folderId}?view=list`) as Route
                    }
                    replace
                    scroll={false}
                    onClick={() => sound("tap")}
                    aria-current={view === v ? "page" : undefined}
                    className={cn(
                      "inline-flex h-8 items-center rounded-full px-3.5 text-[12.5px] font-extrabold text-white/75 hover:text-white",
                      view === v && "bg-white text-ink hover:text-ink",
                    )}
                  >
                    {v}
                  </Link>
                ))}
              </nav>
            )}
            {(files?.length ?? 0) > 0 && view === "list" && (
              <Button
                variant="sticker"
                className="md:hidden"
                aria-pressed={selectMode}
                onClick={() => (selectMode ? clearSelection() : setSelectMode(true))}
              >
                {selectMode ? "done" : "select"}
              </Button>
            )}
            {space && spaceRow && (
              <InviteButton spaceId={spaceRow.id} name={spaceRow.name} role={spaceRow.role} />
            )}
            {spaceRow?.role !== "read" && (
              <AddPicker folderId={folderId} name={here?.name ?? spaceRow?.name} />
            )}
            {here && (!spaceRow || spaceRow.role === "owner") && (
              <FolderMenu folder={here} path={path ?? []} />
            )}
          </>
        }
      />

      {!folderId && <SpaceShelf />}
      {space && spaceRow && spaceRow.people > 1 && (
        <SpaceChat spaceId={spaceRow.id} name={spaceRow.name.toLowerCase()} />
      )}
      {view === "wall" && folderId ? (
        <SpaceWall
          spaceId={folderId}
          subfolders={subfolders}
          shared={(spaceRow?.people ?? 1) > 1}
        />
      ) : (
        <div className="surface-paper paper-sheet min-h-[50vh]">
          {isPending ? (
            <ul aria-hidden>
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
            <div className="py-6">
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
                  className="-mx-5 max-w-[calc(100%+2.5rem)] overflow-x-auto px-5 [scrollbar-width:none] sm:mx-0 sm:max-w-full sm:px-0"
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
              <ul className={cn("border-t border-border", files?.length ? "mt-4.5" : "")}>
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
        </div>
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

/** The way back up, in the kicker pill: "library › sleep papers ›". */
function FolderPath({ folderId }: { folderId: string }) {
  const { data: path } = useFolderPath(folderId)
  return (
    <nav aria-label="Folder path" className="flex min-w-0 items-center gap-1.5">
      <Link href="/library" className="text-white/80 hover:text-white">
        library
      </Link>
      {path?.slice(0, -1).map((p) => (
        <span key={p.id} className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden className="text-white/60">
            ›
          </span>
          <Link
            href={`/library/folders/${p.id}`}
            className="truncate text-white/80 hover:text-white"
          >
            {p.name.toLowerCase()}
          </Link>
        </span>
      ))}
      <span aria-hidden className="text-lime">
        ›
      </span>
    </nav>
  )
}

/** The folder's own actions, as one black sticker beside Upload. */
function FolderMenu({
  folder,
  path,
}: {
  folder: { id: string; name: string }
  path: { id: string; name: string }[]
}) {
  const { trash } = useFolderActions()
  const study = useStudyActions()
  const makeBrief = useMakeBrief()
  const router = useRouter()
  // A deep search on the folder's topic, in a chat focused on it; what's found lands here (F18).
  const findSourcesFor = (target: { id: string; name: string }) => {
    const chatId = crypto.randomUUID()
    holdQuestion(chatId, {
      text: `Find more sources on ${target.name}`,
      deep: true,
      focus: { fileIds: [], folderIds: [target.id] },
      intoFolderId: target.id,
    })
    router.push(`/chats/${chatId}` as Route)
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="sticker" size="icon" aria-label={`More for ${folder.name}`} />}
      >
        <span aria-hidden className="text-[15px] leading-none tracking-[0.08em]">
          •••
        </span>
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
                  const parent = path.at(-2)
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
  )
}

function SubfolderRow({ folder }: { folder: { id: string; name: string; fileCount: number } }) {
  return (
    <li className="relative flex min-h-16 items-center gap-3 border-b border-border px-2 py-3 transition-colors duration-(--duration-press) hover:bg-accent">
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

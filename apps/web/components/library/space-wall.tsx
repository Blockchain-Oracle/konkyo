"use client"

import type { Citation } from "@konkyo/agents"
import { Button } from "@konkyo/ui/components/button"
import { tiltFor } from "@konkyo/ui/lib/space"
import { cn } from "@konkyo/ui/lib/utils"
import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { type CSSProperties, useState } from "react"
import { FolderBriefs } from "@/components/briefs/folder-briefs"
import { AnswerText } from "@/components/chat/answer-text"
import { WallTape } from "@/components/voice/wall-tape"
import { useLitSource } from "@/lib/lit-sources"
import type { Pin } from "@/lib/pins"
import { openFile } from "@/lib/preview"
import { sound } from "@/lib/sounds"
import { useFolderBriefs, useMakeBrief } from "@/lib/use-briefs"
import type { LibraryFile } from "@/lib/use-library"
import { useSpaceFiles } from "@/lib/use-library"
import { usePins, useUnpin } from "@/lib/use-pins"
import { FileStatus } from "./file-status"
import { KIND_LABEL } from "./kind-icon"
import { SourceFace } from "./source-face"
import { AgentsCard, PeopleCard, StudyCard } from "./space-wall-cards"
import { TakesChip, useTakeCounts } from "./takes"

const shortDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" })

const domainOf = (url: string | null) => {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

/** Pages a reader turns: these show as a print of their first page. */
const PRINTS = new Set(["pdf", "docx", "pptx", "markdown", "text", "youtube", "video"])

/**
 * A space's wall: every source filed
 * anywhere in the space, newest first, as the paper object its kind is — a taped print of a
 * paper's first page, a web clipping with the page's own picture, a sticky for a note, an
 * envelope for an email. Folders inside sit beside it as manila folders.
 */
/** The wall's filters (F46): what's new this week, what people talk about, what needs you. */
const FILTERS = {
  all: "all",
  new: "new this week",
  discussed: "discussed",
  needs: "needs you",
} as const
type Filter = keyof typeof FILTERS
const WEEK_MS = 7 * 86_400_000

export function SpaceWall({
  spaceId,
  name,
  subfolders,
  shared = false,
}: {
  spaceId: string
  name: string
  subfolders: { id: string; name: string; fileCount: number }[]
  /** More than one person in it: sources say who added them and carry takes (F56). */
  shared?: boolean
}) {
  const { data: files } = useSpaceFiles(spaceId)
  const { data: pins } = usePins(spaceId)
  const { data: takes } = useTakeCounts(spaceId)
  const [filter, setFilter] = useState<Filter>("all")
  const now = Date.now()
  const matches: Record<Filter, (f: LibraryFile) => boolean> = {
    all: () => true,
    new: (f) => now - new Date(f.createdAt).getTime() < WEEK_MS,
    discussed: (f) => (takes?.[f.id] ?? 0) > 0,
    needs: (f) => f.status === "needs_you",
  }
  // only the filters that would show something (and "all"), so none of them is a dead end
  const offered = (Object.keys(FILTERS) as Filter[]).filter(
    (k) => k === "all" || (files ?? []).some(matches[k]),
  )
  const shown = (files ?? []).filter(matches[filter])
  return (
    <div className="space-wall-frame">
      <WallTape />
      <div className="space-board">
        <section aria-label="Sources">
          {pins?.length ? <PinnedAnswers spaceId={spaceId} pins={pins} /> : null}
          <div className="board-label">
            <span className="room-pill">sources · newest first</span>
            {offered.length > 1 && (
              <span className="flex flex-wrap justify-end gap-1.5">
                {offered.map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={filter === key}
                    onClick={() => setFilter(key)}
                    className={cn(
                      "room-pill hover:bg-ink",
                      filter === key && "bg-white! text-ink!",
                    )}
                  >
                    {FILTERS[key]}
                    {key !== "all" && ` · ${(files ?? []).filter(matches[key]).length}`}
                  </button>
                ))}
              </span>
            )}
          </div>
          {files?.length ? (
            <ul className="space-masonry">
              {shown.map((file) => (
                <li key={file.id} data-file-id={file.id} className="wall-item">
                  <WallObject file={file} />
                  {/* a member's source says whose it is; the owner's are the space's own */}
                  {shared && !file.byOwner && file.mine === false && file.addedBy && (
                    <span className="wall-by">by {file.addedBy.toLowerCase()}</span>
                  )}
                  {shared && file.status === "ready" && (
                    <TakesChip
                      spaceId={spaceId}
                      fileId={file.id}
                      title={file.title}
                      count={takes?.[file.id] ?? 0}
                    />
                  )}
                </li>
              ))}
            </ul>
          ) : files ? (
            <div
              className="board-note board-object tone-violet max-w-md cursor-default"
              style={{ rotate: "-1.2deg" } as CSSProperties}
            >
              {/* a short hint: no torn backing, which only fits a full-height note */}
              <span className="note-paper-sheet min-h-0!">
                <span className="note-kicker">an empty wall</span>
                <span className="note-text">
                  Drop files anywhere on this page, or press add: papers, links, videos, notes.
                </span>
              </span>
              <span className="note-paper-tape" aria-hidden />
            </div>
          ) : null}
        </section>
        <aside aria-label="Inside this space" className="grid content-start gap-9">
          {subfolders.length > 0 && (
            <section aria-label="Folders">
              <div className="board-label">
                <span className="room-pill">folders inside</span>
              </div>
              <ul className="grid gap-5">
                {subfolders.map((folder) => (
                  <li key={folder.id}>
                    <Link
                      href={`/library/folders/${folder.id}` as Route}
                      onClick={() => sound("tap")}
                      className="board-manila board-object"
                      style={{ rotate: tiltFor(folder.id, 300) } as CSSProperties}
                    >
                      <span className="board-manila-tab" aria-hidden />
                      <strong>{folder.name.toLowerCase()}</strong>
                      <span>
                        {folder.fileCount} file{folder.fileCount === 1 ? "" : "s"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {files?.length ? (
            <section
              aria-label="Listen"
              className="surface-sticker board-sticker-card relative p-5"
            >
              <span className="board-pin" aria-hidden />
              <p className="font-display text-[19px] font-extrabold tracking-[-0.02em] text-white">
                listen to this space
              </p>
              <p className="mt-1.5 text-[13px] text-room-muted">
                A two-voice audio brief, every claim from these sources.
              </p>
              <ListenCard
                spaceId={spaceId}
                ready={Boolean(files?.some((f) => f.status === "ready"))}
              />
            </section>
          ) : null}
          {files?.some((f) => f.status === "ready") && <StudyCard spaceId={spaceId} name={name} />}
          <AgentsCard spaceId={spaceId} name={name} />
          {shared && <PeopleCard spaceId={spaceId} />}
        </aside>
      </div>
    </div>
  )
}

/** The space's briefs, or one lime action to make the first. */
function ListenCard({ spaceId, ready }: { spaceId: string; ready: boolean }) {
  const { data: briefs } = useFolderBriefs(spaceId)
  const makeBrief = useMakeBrief()
  const has = (briefs ?? []).some((b) => b.status !== "failed")
  if (has) return <FolderBriefs folderId={spaceId} />
  return (
    <Button
      className="mt-4"
      disabled={!ready || makeBrief.isPending}
      onClick={() => {
        sound("place")
        makeBrief.mutate(spaceId)
      }}
    >
      {makeBrief.isPending ? "starting…" : "make the brief"}
    </Button>
  )
}

/** A pin's frozen citations, in the shape the answer renderer reads (every one was verified). */
const pinCitations = (pin: Pin): Citation[] =>
  pin.citations.map((c) => ({
    ...c,
    label: `p${c.n}`,
    text: c.quote,
    state: "verified" as const,
  }))

/**
 * Answers pinned to the wall: a cream reply slip each,
 * the question, the verified answer with its citations (they open the passage), the receipt.
 */
function PinnedAnswers({ spaceId, pins }: { spaceId: string; pins: Pin[] }) {
  const unpin = useUnpin(spaceId)
  return (
    <div className="mb-10">
      <div className="board-label">
        <span className="room-pill">pinned answers</span>
      </div>
      <ul className="grid items-start gap-7 xl:grid-cols-2">
        {pins.map((pin) => (
          <li key={pin.id} data-pin-id={pin.id}>
            <article
              className="pin-slip surface-paper"
              style={{ rotate: tiltFor(pin.id, 160) } as CSSProperties}
            >
              <span className="pin-slip-kicker">pinned answer · {shortDate(pin.createdAt)}</span>
              <h3 className="pin-slip-question">{pin.question}</h3>
              <AnswerText body={pin.body} citations={pinCitations(pin)} />
              <div className="pin-slip-foot">
                <span className="pin-slip-receipt">
                  ✓ {pin.quotes === 1 ? "1 quote" : `${pin.quotes} quotes`} checked
                </span>
                {pin.by && <span className="pin-slip-by">pinned by {pin.by.toLowerCase()}</span>}
                {pin.chatId && (
                  <Link href={`/chats/${pin.chatId}` as Route} onClick={() => sound("tap")}>
                    open the chat ↗
                  </Link>
                )}
                {pin.canUnpin && (
                  <button
                    type="button"
                    onClick={() => {
                      sound("tap")
                      unpin.mutate(pin.id)
                    }}
                  >
                    unpin
                  </button>
                )}
              </div>
            </article>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** One source on the wall, as the paper object its kind is. */
function WallObject({ file }: { file: LibraryFile }) {
  const router = useRouter()
  // An answer in the panel is reading or citing this source.
  const lit = useLitSource(file.id)
  const ready = file.status === "ready"
  const open = () => ready && openFile(file, (href) => router.push(href as Route))
  const style = { rotate: tiltFor(file.id, 240) } as CSSProperties
  const meta = `${KIND_LABEL[file.kind]}${file.pageCount ? ` · ${file.pageCount} pages` : ""} · ${shortDate(file.createdAt)}`

  // Still being read, or needs you: a plain sheet that says what's happening, in place.
  if (!ready)
    return (
      <div className="surface-paper board-sheet board-object px-4! py-4!" style={style}>
        <div className="flex items-start gap-3">
          <SourceFace file={file} />
          <div className="min-w-0 flex-1">
            <p className="line-clamp-3 font-display text-[15px] leading-tight font-extrabold text-ink">
              {file.title}
            </p>
            <div className="mt-2">
              <FileStatus file={file} />
            </div>
          </div>
        </div>
      </div>
    )

  if (file.kind === "note")
    return (
      <button
        type="button"
        onClick={open}
        className={cn("board-sticky board-object", lit && "is-lit")}
        style={style}
      >
        <span className="board-sticky-kicker">note · {shortDate(file.createdAt)}</span>
        <strong>{file.title}</strong>
      </button>
    )

  if (file.kind === "email")
    return (
      <button
        type="button"
        onClick={open}
        className={cn("board-envelope board-object", lit && "is-lit")}
        style={style}
      >
        <span className="board-envelope-flap" aria-hidden />
        <span className="board-envelope-kicker">mail · {shortDate(file.createdAt)}</span>
        <strong>{file.title}</strong>
      </button>
    )

  if (file.kind === "web" && file.hasThumb)
    return (
      <button
        type="button"
        onClick={open}
        className={cn("board-clip board-object", lit && "is-lit")}
        style={style}
      >
        <span className="photo-tape" aria-hidden />
        {/* biome-ignore lint/performance/noImgElement: same-origin webp thumbs, already sized */}
        <img src={`/api/files/${file.id}/thumb`} alt="" loading="lazy" />
        <span className="board-clip-text">
          <span className="board-clip-domain">{domainOf(file.sourceUrl) ?? "web page"}</span>
          <strong>{file.title}</strong>
        </span>
      </button>
    )

  if (PRINTS.has(file.kind) && file.hasThumb)
    return (
      <button
        type="button"
        onClick={open}
        className={cn("board-print board-object", lit && "is-lit")}
        style={style}
      >
        <span className="photo-tape photo-tape-left" aria-hidden />
        <span className="photo-tape photo-tape-right" aria-hidden />
        {/* biome-ignore lint/performance/noImgElement: same-origin webp thumbs, already sized */}
        <img src={`/api/files/${file.id}/thumb`} alt="" loading="lazy" />
        <span className="board-print-caption">
          <strong>{file.title}</strong>
          <span>{meta}</span>
        </span>
      </button>
    )

  return (
    <button
      type="button"
      onClick={open}
      className={cn(
        "surface-paper board-sheet board-object block w-full px-4! py-4! text-left",
        lit && "is-lit",
      )}
      style={style}
    >
      <span className="flex items-start gap-3">
        <SourceFace file={file} />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-3 font-display text-[15px] leading-tight font-extrabold text-ink">
            {file.title}
          </span>
          <span className="mt-1.5 block text-[12px] font-semibold text-ink-muted">{meta}</span>
        </span>
      </span>
    </button>
  )
}

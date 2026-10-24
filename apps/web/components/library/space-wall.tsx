"use client"

import { Button } from "@konkyo/ui/components/button"
import { tiltFor } from "@konkyo/ui/lib/space"
import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { CSSProperties } from "react"
import { FolderBriefs } from "@/components/briefs/folder-briefs"
import { openFile } from "@/lib/preview"
import { sound } from "@/lib/sounds"
import { useFolderBriefs, useMakeBrief } from "@/lib/use-briefs"
import type { LibraryFile } from "@/lib/use-library"
import { useSpaceFiles } from "@/lib/use-library"
import { FileStatus } from "./file-status"
import { KIND_LABEL } from "./kind-icon"
import { SourceFace } from "./source-face"

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
 * A space's wall (plan F46; OurSpaces' board, arranged by itself, R5): every source filed
 * anywhere in the space, newest first, as the paper object its kind is — a taped print of a
 * paper's first page, a web clipping with the page's own picture, a sticky for a note, an
 * envelope for an email. Folders inside sit beside it as manila folders.
 */
export function SpaceWall({
  spaceId,
  subfolders,
}: {
  spaceId: string
  subfolders: { id: string; name: string; fileCount: number }[]
}) {
  const { data: files } = useSpaceFiles(spaceId)
  return (
    <div className="space-board">
      <section aria-label="Sources">
        <div className="board-label">
          <span className="room-pill">sources · newest first</span>
        </div>
        {files?.length ? (
          <ul className="space-masonry">
            {files.map((file) => (
              <li key={file.id}>
                <WallObject file={file} />
              </li>
            ))}
          </ul>
        ) : files ? (
          <div
            className="board-note board-object tone-violet max-w-md cursor-default"
            style={{ rotate: "-1.2deg" } as CSSProperties}
          >
            <span className="note-paper-backing" aria-hidden />
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
          <section aria-label="Listen" className="surface-sticker board-sticker-card relative p-5">
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
      </aside>
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

function WallObject({ file }: { file: LibraryFile }) {
  const router = useRouter()
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
      <button type="button" onClick={open} className="board-sticky board-object" style={style}>
        <span className="board-sticky-kicker">note · {shortDate(file.createdAt)}</span>
        <strong>{file.title}</strong>
      </button>
    )

  if (file.kind === "email")
    return (
      <button type="button" onClick={open} className="board-envelope board-object" style={style}>
        <span className="board-envelope-flap" aria-hidden />
        <span className="board-envelope-kicker">mail · {shortDate(file.createdAt)}</span>
        <strong>{file.title}</strong>
      </button>
    )

  if (file.kind === "web" && file.hasThumb)
    return (
      <button type="button" onClick={open} className="board-clip board-object" style={style}>
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
      <button type="button" onClick={open} className="board-print board-object" style={style}>
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
      className="surface-paper board-sheet board-object block w-full px-4! py-4! text-left"
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

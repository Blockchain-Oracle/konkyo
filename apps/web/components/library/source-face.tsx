import type { FileKind } from "@konkyo/config"
import { readableInk } from "@konkyo/ui/lib/space"

/** A kind without a picture shows as a coloured tile with a short word: never an icon. */
const KIND_TAG: Record<FileKind, { word: string; bg: string }> = {
  pdf: { word: "pdf", bg: "#ff7c42" },
  docx: { word: "doc", bg: "#3f70ff" },
  pptx: { word: "slides", bg: "#ffb02e" },
  markdown: { word: "md", bg: "#7853ff" },
  text: { word: "txt", bg: "#dcd2d9" },
  web: { word: "web", bg: "#13b8a6" },
  youtube: { word: "video", bg: "#e9369d" },
  audio: { word: "rec", bg: "#e9369d" },
  video: { word: "video", bg: "#ff7c42" },
  note: { word: "note", bg: "#ffe9c2" },
  email: { word: "mail", bg: "#bfe9dc" },
}

/**
 * A source's face: its real first page, og:image or video still (the worker's thumb job, served by
 * /api/files/:id/thumb), or its kind as a word on a colour tile.
 */
export function SourceFace({ file }: { file: { id: string; kind: FileKind; hasThumb: boolean } }) {
  if (file.hasThumb)
    return (
      <span className="board-thumb" aria-hidden>
        {/* biome-ignore lint/performance/noImgElement: same-origin webp thumbs, already sized */}
        <img src={`/api/files/${file.id}/thumb`} alt="" loading="lazy" />
      </span>
    )
  const tag = KIND_TAG[file.kind]
  return (
    <span
      className="board-thumb"
      style={{ background: tag.bg, color: readableInk(tag.bg) }}
      aria-hidden
    >
      {tag.word}
    </span>
  )
}

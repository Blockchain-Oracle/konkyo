import type { FileKind } from "@konkyo/config"
import { cn } from "@konkyo/ui/lib/utils"
import {
  AudioLinesIcon,
  FileCode2Icon,
  FileTextIcon,
  FileTypeIcon,
  FilmIcon,
  GlobeIcon,
  PresentationIcon,
} from "lucide-react"

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

export const KIND_LABEL: Record<FileKind, string> = {
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

export function KindIcon({ kind, className }: { kind: FileKind; className?: string }) {
  if (kind === "youtube") {
    // A real logo, not a generic icon (plan §7.9).
    return (
      // biome-ignore lint/performance/noImgElement: static brand SVG
      <img src="/logos/youtube.svg" alt="" className={cn("h-3.5 w-5 object-contain", className)} />
    )
  }
  const Icon = KIND_ICON[kind]
  return <Icon className={cn("size-4 text-ash-gray", className)} strokeWidth={1.5} aria-hidden />
}

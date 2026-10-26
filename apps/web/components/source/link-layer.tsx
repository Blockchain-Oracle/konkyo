"use client"

import {
  PdfActionType,
  type PdfAnnotationObject,
  PdfAnnotationSubtype,
  type PdfDocumentObject,
  type PdfEngine,
  type PdfPageObject,
  type Rect,
} from "@embedpdf/models"
import { type MouseEvent, useRef } from "react"
import { useQuery } from "@/lib/use-query"

/** Where a link goes: out to the web or mail, or to another page of the same file. */
type PageLink = { rect: Rect } & ({ href: string } | { page: number })

const OUTBOUND = new Set(["http:", "https:", "mailto:"])

/** A PDF is someone else's file: only web and mail addresses leave the viewer (never `javascript:`). */
function outbound(uri: string) {
  try {
    const url = new URL(uri)
    return OUTBOUND.has(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

function linkOf(anno: PdfAnnotationObject): PageLink | null {
  if (anno.type !== PdfAnnotationSubtype.LINK || !anno.target) return null
  const { rect, target } = anno
  if (target.type === "destination") return { rect, page: target.destination.pageIndex + 1 }
  const { action } = target
  if (action.type === PdfActionType.Goto) return { rect, page: action.destination.pageIndex + 1 }
  if (action.type !== PdfActionType.URI) return null
  const href = outbound(action.uri)
  return href ? { rect, href } : null
}

/** A press that moved this far was a drag (a selection), not a click. */
const DRAG_PX = 4

/**
 * The page's links. The pages are drawn as images, so a link is only pixels until its annotation
 * is read from the file: each one becomes a clickable box over the printed link, in the page's
 * unrotated frame like the marks. A drag that starts on one still selects text.
 */
export function LinkLayer({
  engine,
  doc,
  page,
  fileId,
  scale,
  onGoto,
}: {
  engine: PdfEngine
  doc: PdfDocumentObject
  page: PdfPageObject
  fileId: string
  scale: number
  onGoto: (pageNumber: number) => void
}) {
  const { data: links } = useQuery({
    queryKey: ["pdf-links", fileId, page.index],
    queryFn: async () => {
      const annos = await engine.getPageAnnotations(doc, page).toPromise()
      return annos.flatMap((anno) => linkOf(anno) ?? [])
    },
    staleTime: Number.POSITIVE_INFINITY,
  })
  const pressed = useRef<{ x: number; y: number } | null>(null)
  if (!links?.length) return null

  // A drag that ends on a link, or the second click of a double-click (selecting a word), only
  // selects: following the link is for one still click.
  const follows = (event: MouseEvent) => {
    const from = pressed.current
    const dragged = from && Math.hypot(event.clientX - from.x, event.clientY - from.y) > DRAG_PX
    return !dragged && event.detail <= 1
  }

  return (
    <div
      className="pointer-events-none absolute inset-0"
      onPointerDown={(event) => {
        pressed.current = { x: event.clientX, y: event.clientY }
      }}
    >
      {links.map((link) => {
        const { origin, size } = link.rect
        const box = {
          left: origin.x * scale,
          top: origin.y * scale,
          width: size.width * scale,
          height: size.height * scale,
        }
        const key = `${origin.x}:${origin.y}`
        const className =
          "pointer-events-auto absolute cursor-pointer rounded-[2px] transition-colors duration-(--duration-press) hover:bg-[rgb(128_82_255/0.14)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        if ("href" in link)
          return (
            <a
              key={key}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              title={link.href}
              onClick={(event) => {
                if (!follows(event)) event.preventDefault()
              }}
              style={box}
              className={className}
            >
              <span className="sr-only">Open link: {link.href}</span>
            </a>
          )
        return (
          <button
            key={key}
            type="button"
            title={`Go to page ${link.page}`}
            aria-label={`Go to page ${link.page}`}
            onClick={(event) => {
              if (follows(event)) onGoto(link.page)
            }}
            style={box}
            className={className}
          />
        )
      })}
    </div>
  )
}

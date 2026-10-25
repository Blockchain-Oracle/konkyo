"use client"

import { createPluginRegistration } from "@embedpdf/core"
import { EmbedPDF } from "@embedpdf/core/react"
import type { PdfEngine, Rotation } from "@embedpdf/models"
import {
  DocumentContent,
  DocumentManagerPluginPackage,
  useActiveDocument,
  useDocumentManagerCapability,
} from "@embedpdf/plugin-document-manager/react"
import {
  GlobalPointerProvider,
  InteractionManagerPluginPackage,
  PagePointerProvider,
} from "@embedpdf/plugin-interaction-manager/react"
import { RenderLayer, RenderPluginPackage } from "@embedpdf/plugin-render/react"
import { Rotate, RotatePluginPackage } from "@embedpdf/plugin-rotate/react"
import {
  type PageLayout,
  Scroller,
  ScrollPluginPackage,
  useScroll,
  useScrollCapability,
} from "@embedpdf/plugin-scroll/react"
import {
  SelectionLayer,
  SelectionPluginPackage,
  type SelectionSelectionMenuProps,
} from "@embedpdf/plugin-selection/react"
import { TilingLayer, TilingPluginPackage } from "@embedpdf/plugin-tiling/react"
import { Viewport, ViewportPluginPackage } from "@embedpdf/plugin-viewport/react"
import { useZoom, ZoomMode, ZoomPluginPackage } from "@embedpdf/plugin-zoom/react"
import { Button } from "@konkyo/ui/components/button"
import { Spinner } from "@konkyo/ui/components/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@konkyo/ui/components/tooltip"
import { cn } from "@konkyo/ui/lib/utils"
import { MinusIcon, MoonIcon, PlusIcon, ScanIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSourceAccess } from "@/lib/source-access"
import { useHighlights } from "@/lib/use-highlights"
import { type SourcePassage, usePassages } from "@/lib/use-source"
import { boxesFor, CitationLayer, MarkLayer } from "./citation-layer"
import { SelectionToolbar } from "./selection-toolbar"

/** Served from /public by scripts/vendor.mjs (no third-party CDN at runtime). */
const PDFIUM_WASM = "/vendor/pdfium.wasm"

let enginePromise: Promise<PdfEngine> | null = null

/** One PDFium engine (in a web worker) for the whole app; every viewer shares it. */
function loadEngine() {
  // Absolute: the engine's worker starts from a blob: URL, where "/vendor/…" would not resolve.
  const wasmUrl = new URL(PDFIUM_WASM, window.location.origin).href
  enginePromise ??= import("@embedpdf/engines/pdfium-worker-engine").then(
    ({ createPdfiumEngine }) => createPdfiumEngine(wasmUrl),
  )
  return enginePromise
}

function useEngine() {
  const [engine, setEngine] = useState<PdfEngine | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    loadEngine().then(
      (e) => live && setEngine(e),
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [])
  return { engine, failed }
}

const PAGE_GAP = 12

export type PdfTarget = { page?: number; passage?: SourcePassage; quote?: string; nonce: number }

/**
 * The source viewer (plan F07): EmbedPDF renders only the pages near the viewport, so a 500-page
 * PDF scrolls like a short one. Cited passages are marked on top of the page in amber, and a
 * selection offers the toolbar's actions.
 */
export function PdfViewer({
  url,
  fileId,
  title,
  target,
}: {
  url: string
  fileId: string
  title: string
  target?: PdfTarget
}) {
  const { engine, failed } = useEngine()
  // Plugin registrations are made once per viewer.
  const [plugins] = useState(() => [
    createPluginRegistration(DocumentManagerPluginPackage),
    createPluginRegistration(ViewportPluginPackage, { viewportGap: PAGE_GAP }),
    createPluginRegistration(ScrollPluginPackage, {
      defaultPageGap: PAGE_GAP,
      defaultBufferSize: 2,
    }),
    createPluginRegistration(RenderPluginPackage),
    createPluginRegistration(TilingPluginPackage, { tileSize: 768, overlapPx: 2.5, extraRings: 0 }),
    createPluginRegistration(InteractionManagerPluginPackage),
    createPluginRegistration(SelectionPluginPackage, { marquee: { enabled: false } }),
    createPluginRegistration(ZoomPluginPackage, {
      defaultZoomLevel: ZoomMode.FitWidth,
      minZoom: 0.25,
      maxZoom: 4,
    }),
    createPluginRegistration(RotatePluginPackage),
  ])

  // A failed open can be tried again: a new loader asks for the document afresh.
  const [attempt, setAttempt] = useState(0)

  if (failed) return <ViewerMessage>The PDF viewer couldn't start. Reload the page.</ViewerMessage>
  if (!engine) return <ViewerLoading target={target} />
  return (
    <EmbedPDF engine={engine} plugins={plugins}>
      <DocumentLoader
        key={attempt}
        url={url}
        fileId={fileId}
        title={title}
        target={target}
        onRetry={() => setAttempt((n) => n + 1)}
      />
    </EmbedPDF>
  )
}

function DocumentLoader({
  onRetry,
  url,
  fileId,
  title,
  target,
}: {
  url: string
  fileId: string
  title: string
  target?: PdfTarget
  onRetry: () => void
}) {
  const { provides: manager } = useDocumentManagerCapability()
  const { provides: scroll } = useScrollCapability()
  const { activeDocumentId } = useActiveDocument()
  const opened = useRef<string | null>(null)
  // Pages have their final size only once the first fit-to-width layout is done; a jump made
  // before that lands in the wrong place when the zoom settles.
  const [layoutReady, setLayoutReady] = useState(false)
  useEffect(
    () =>
      scroll?.onLayoutReady((event) => {
        if (event.documentId === fileId) setLayoutReady(true)
      }),
    [scroll, fileId],
  )

  useEffect(() => {
    // The signed URL changes when it is refreshed; the document is the same, so open it once.
    if (!manager || opened.current === fileId) return
    opened.current = fileId
    // EmbedPDF 2.15's web engine reads the whole file before opening it (no range loading), so
    // say so; the content route's cache header makes reopening it instant.
    manager.openDocumentUrl({ url, documentId: fileId, name: title, mode: "full-fetch" })
  }, [manager, url, fileId, title])

  return (
    <DocumentContent documentId={activeDocumentId}>
      {({ isLoaded, isError }) =>
        isError ? (
          <ViewerMessage action={{ label: "Try again", run: onRetry }}>
            This PDF couldn't be opened.
          </ViewerMessage>
        ) : isLoaded && activeDocumentId ? (
          <LoadedDocument
            documentId={activeDocumentId}
            fileId={fileId}
            title={title}
            target={target}
            layoutReady={layoutReady}
          />
        ) : (
          <ViewerLoading target={target} />
        )
      }
    </DocumentContent>
  )
}

function LoadedDocument({
  documentId,
  fileId,
  title,
  target,
  layoutReady,
}: {
  documentId: string
  fileId: string
  title: string
  target?: PdfTarget
  layoutReady: boolean
}) {
  const { state: scroll, provides: scroller } = useScroll(documentId)
  const { state: zoom, provides: zoomer } = useZoom(documentId)
  const { activeDocument } = useActiveDocument()
  const pages = activeDocument?.document?.pages
  const [dim, setDim] = useState(false)
  const scale = zoom.currentZoomLevel
  const { owner } = useSourceAccess()
  const { data: highlights } = useHighlights(fileId)
  const marksByPage = useMemo(() => {
    const byPage = new Map<number, [number, number, number, number][]>()
    for (const h of highlights ?? [])
      byPage.set(h.page, [...(byPage.get(h.page) ?? []), ...h.rects])
    return byPage
  }, [highlights])

  // Jump to the cited place once the layout exists: the passage's first line sits a quarter of the
  // way down the pane, so the lines above it give context.
  const jumped = useRef<number | null>(null)
  useEffect(() => {
    if (!target || !scroller || !layoutReady || jumped.current === target.nonce) return
    const page = target.passage?.page ?? target.page
    if (!page) return
    jumped.current = target.nonce
    // The first line of the quote itself, so the eye lands on the proof, not the passage's start.
    const first = target.passage ? boxesFor(target.passage, target.quote)[0] : undefined
    scroller.scrollToPage({
      pageNumber: page,
      ...(first ? { pageCoordinates: { x: first[0], y: first[1] }, alignY: 25 } : {}),
      behavior: "auto",
    })
  }, [target, scroller, layoutReady])

  const renderPage = useCallback(
    (page: PageLayout) => {
      const intrinsic = (pages?.[page.pageIndex]?.rotation ?? 0) as Rotation
      const cited =
        target?.passage && target.passage.page === page.pageNumber ? target.passage : undefined
      return (
        <Rotate documentId={documentId} pageIndex={page.pageIndex} rotation={intrinsic}>
          <PagePointerProvider
            documentId={documentId}
            pageIndex={page.pageIndex}
            rotation={intrinsic}
            className="relative select-none"
            data-page={page.pageNumber}
          >
            {/* What a screen reader reads: the page's text, from the passages Konkyo read. */}
            <PageText fileId={fileId} page={page.pageNumber} />
            {/* PDFs keep their own colours; "Dim" lowers the glare of white pages at night. */}
            <div
              aria-hidden="true"
              className={cn(
                "absolute inset-0 bg-white transition-[filter] duration-(--duration-menu)",
                dim && "brightness-[0.78]",
              )}
            >
              <RenderLayer
                documentId={documentId}
                pageIndex={page.pageIndex}
                scale={Math.min(scale, 1)}
                className="pointer-events-none absolute inset-0 size-full"
              />
              <TilingLayer
                documentId={documentId}
                pageIndex={page.pageIndex}
                className="pointer-events-none"
              />
            </div>
            {marksByPage.get(page.pageNumber) && (
              <MarkLayer rects={marksByPage.get(page.pageNumber) ?? []} scale={scale} />
            )}
            {cited && (
              <CitationLayer
                key={`${cited.id}:${target?.nonce}`}
                fileId={fileId}
                passage={cited}
                quote={target?.quote}
                scale={scale}
              />
            )}
            <SelectionLayer
              documentId={documentId}
              pageIndex={page.pageIndex}
              scale={scale}
              textStyle={{ background: "rgb(128 82 255 / 0.28)" }}
              selectionMenu={
                owner
                  ? (props: SelectionSelectionMenuProps) => (
                      <SelectionToolbar
                        {...props}
                        documentId={documentId}
                        fileId={fileId}
                        title={title}
                      />
                    )
                  : undefined
              }
            />
          </PagePointerProvider>
        </Rotate>
      )
    },
    [documentId, fileId, title, pages, scale, target, dim, marksByPage, owner],
  )

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-3">
        <p className="text-snippet text-ash-gray tabular-nums" aria-live="polite">
          Page {scroll.currentPage || 1} of {scroll.totalPages || pages?.length || "…"}
        </p>
        <div className="ml-auto flex items-center gap-0.5">
          <ToolbarButton label="Zoom out" onClick={() => zoomer?.zoomOut()}>
            <MinusIcon />
          </ToolbarButton>
          <span className="w-11 text-center text-snippet text-ash-gray tabular-nums">
            {Math.round(scale * 100)}%
          </span>
          <ToolbarButton label="Zoom in" onClick={() => zoomer?.zoomIn()}>
            <PlusIcon />
          </ToolbarButton>
          <ToolbarButton label="Fit width" onClick={() => zoomer?.requestZoom(ZoomMode.FitWidth)}>
            <ScanIcon />
          </ToolbarButton>
          <ToolbarButton
            label={dim ? "Full brightness" : "Dim pages"}
            pressed={dim}
            onClick={() => setDim((d) => !d)}
          >
            <MoonIcon />
          </ToolbarButton>
        </div>
      </div>
      <Viewport
        documentId={documentId}
        className="min-h-0 flex-1 bg-muted"
        role="region"
        aria-label={title}
        tabIndex={0}
      >
        <GlobalPointerProvider documentId={documentId}>
          <Scroller documentId={documentId} renderPage={renderPage} />
        </GlobalPointerProvider>
      </Viewport>
    </div>
  )
}

function ToolbarButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string
  pressed?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            aria-pressed={pressed}
            onClick={onClick}
            className={cn(
              "text-ash-gray hover:text-bone-white [&_svg]:size-4 [&_svg]:stroke-[1.5]",
              pressed && "bg-raised text-bone-white",
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** Past this, a first open says it's still coming (a large PDF and the viewer both load once). */
const SLOW_OPEN_MS = 8_000

/**
 * While the document opens: the cited words come first, so a slow first open still shows what
 * the citation points at, and after a while it says it's still opening.
 */
function ViewerLoading({ target }: { target?: PdfTarget }) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_OPEN_MS)
    return () => window.clearTimeout(timer)
  }, [])
  const words = target?.quote ?? target?.passage?.text
  return (
    <div className="grid flex-1 place-items-center bg-muted p-6" role="status">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <Spinner className="size-5 text-ash-gray" />
        {words && (
          <blockquote className="text-pretty text-snippet text-silver-mist">
            “{words.length > 400 ? `${words.slice(0, 400)}…` : words}”
            {target?.page != null && (
              <span className="mt-1 block text-meta text-ash-gray">page {target.page}</span>
            )}
          </blockquote>
        )}
        <span className={cn("text-meta text-ash-gray", !slow && "sr-only")}>
          {slow
            ? "Still opening: a large document takes a moment the first time."
            : "Opening the document"}
        </span>
      </div>
    </div>
  )
}

/** One page's words, for screen readers (the page itself is drawn as images). */
function PageText({ fileId, page }: { fileId: string; page: number }) {
  const { data } = usePassages(fileId, { page })
  if (!data?.length) return null
  return (
    <div className="sr-only">
      <h3>Page {page}</h3>
      {data.map((p) => (
        <p key={p.id}>{p.text}</p>
      ))}
    </div>
  )
}

function ViewerMessage({
  children,
  action,
}: {
  children: React.ReactNode
  action?: { label: string; run: () => void }
}) {
  return (
    <div className="grid flex-1 place-items-center bg-muted p-6 text-center text-ui text-ash-gray">
      <div className="flex flex-col items-center gap-3">
        <p>{children}</p>
        {action && (
          <Button variant="secondary" size="sm" onClick={action.run}>
            {action.label}
          </Button>
        )}
      </div>
    </div>
  )
}

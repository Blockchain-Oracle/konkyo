import { INGEST } from "@konkyo/config"
import { createIsomorphicCanvasFactory } from "unpdf"
import { openPdf } from "./pdf/load"

/**
 * Real covers for sources. Page one of a document, or the
 * image a web page or video chose for itself, as a small WebP for the wall's polaroids.
 */
export const THUMB = { width: 480, quality: 82, maxImageBytes: 5 * 1024 * 1024 } as const

// biome-ignore lint/suspicious/noExplicitAny: unpdf types the canvas factory loosely
let Factory: any

/** Page one of a PDF, white behind it, `width` pixels wide. */
export function pdfThumb(pdf: Uint8Array, width: number = THUMB.width): Promise<Uint8Array> {
  return pdfPage(pdf, 1, width)
}

/** Any page of a PDF as a WebP this wide. */
export async function pdfPage(
  pdf: Uint8Array,
  pageNumber: number,
  width: number = THUMB.width,
): Promise<Uint8Array> {
  Factory ??= await createIsomorphicCanvasFactory(() => import("@napi-rs/canvas"))
  const doc = await openPdf(pdf)
  try {
    const page = await doc.getPage(Math.min(Math.max(1, pageNumber), doc.numPages))
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: width / base.width })
    const f = new Factory()
    const { canvas, context } = f.create(Math.round(viewport.width), Math.round(viewport.height))
    try {
      context.fillStyle = "#fff"
      context.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, canvasContext: context, viewport }).promise
      return new Uint8Array(await canvas.encode("webp", THUMB.quality))
    } finally {
      f.destroy({ canvas, context })
    }
  } finally {
    await doc.cleanup()
  }
}

/** An image from the web (a page's og:image, a video thumbnail), resized to a WebP. */
export async function imageThumb(url: string, width: number = THUMB.width): Promise<Uint8Array> {
  const parsed = new URL(url)
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    throw new Error("Not a web image")
  const res = await fetch(parsed, {
    redirect: "follow",
    headers: { "user-agent": INGEST.userAgent, accept: "image/*" },
    signal: AbortSignal.timeout(INGEST.fetchTimeoutMs),
  })
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`)
  if (!(res.headers.get("content-type") ?? "").startsWith("image/")) throw new Error("Not an image")
  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.byteLength > THUMB.maxImageBytes) throw new Error("Image too large")
  const { createCanvas, loadImage } = await import("@napi-rs/canvas")
  const image = await loadImage(Buffer.from(bytes))
  const scale = Math.min(1, width / image.width)
  const canvas = createCanvas(Math.round(image.width * scale), Math.round(image.height * scale))
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height)
  return new Uint8Array(await canvas.encode("webp", THUMB.quality))
}

/** YouTube's own thumbnail for a video id. */
export const youTubeThumbUrl = (videoId: string) =>
  `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`

/** The og:image (or twitter:image) a page declares for itself, made absolute. */
export function ogImageOf(document: Document, pageUrl: string): string | undefined {
  const content =
    document.querySelector('meta[property="og:image"]')?.getAttribute("content") ??
    document.querySelector('meta[name="twitter:image"]')?.getAttribute("content")
  if (!content) return undefined
  try {
    return new URL(content, pageUrl).toString()
  } catch {
    return undefined
  }
}

// Renders a page with @napi-rs/canvas for the ink check (no PNG round trip).
// createIsomorphicCanvasFactory injects Path2D/DOMMatrix/ImageData globals from @napi-rs/canvas (same as renderPageAsImage).

import { createIsomorphicCanvasFactory } from "unpdf"
import type { PDFPageProxy } from "unpdf/pdfjs"
export const INK_SCALE = 0.75
// biome-ignore lint/suspicious/noExplicitAny: unpdf types the canvas factory loosely
let Factory: any
export async function renderRGBA(page: PDFPageProxy, scale = INK_SCALE) {
  Factory ??= await createIsomorphicCanvasFactory(() => import("@napi-rs/canvas"))
  const vp = page.getViewport({ scale, rotation: 0 }) // same frame as stored boxes
  const f = new Factory()
  const { canvas, context } = f.create(vp.width, vp.height)
  try {
    context.fillStyle = "#fff"
    context.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, canvasContext: context, viewport: vp }).promise
    const w = canvas.width,
      h = canvas.height
    return { rgba: context.getImageData(0, 0, w, h).data as Uint8ClampedArray, w, h, scale }
  } finally {
    f.destroy({ canvas, context })
  }
}

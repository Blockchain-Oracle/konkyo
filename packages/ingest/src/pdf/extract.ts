// PDF extraction preserves page geometry, including rotated and cropped pages.
// Pipeline: PDF -> lines -> paragraphs -> passages with per-line boxes.
//
// Coordinate contract (what we store) = EmbedPDF's page space (document opened with normalizeRotation: true):
//   the page at 0 degrees (its /Rotate NOT applied), origin top-left of the CropBox, x right, y down,
//   units = PDF points (1/72 in). Same as pdf.js page.getViewport({ scale: 1, rotation: 0 }).
//   The viewer applies (page /Rotate + user rotation) and zoom itself:
//   EmbedPDF transformRect(page.size, rect, rotationQuarterTurns, scale)  (@embedpdf/models).
//
// Items come from pdf.js getTextContent() (the same call unpdf's extractTextItems wraps),
// because we need the full text matrix (rotation) and want to stream page by page.
// `itemsFromUnpdf` maps unpdf's StructuredTextItem into the same shape for comparison.

import type { StructuredTextItem } from "unpdf"
import type { PDFDocumentProxy, PDFPageProxy } from "unpdf/pdfjs"

export type Box = [number, number, number, number] // x0, y0, x1, y1 (page space)

export interface Item {
  str: string
  box: Box
  fs: number // font size in page space
  angle: number // degrees, baseline direction in page space (0 = normal horizontal)
  idx: number // content-stream order
  font: string
}

export interface Line {
  items: Item[]
  box: Box // reading frame (== storage frame unless the page's text is sideways)
  dbox?: Box // storage frame box (0 degrees, top-left, points)
  fs: number
  text: string
  idx: number
}

export interface Para {
  lines: Line[]
  box: Box
  fs: number
  heading: boolean
  figure: boolean // figure labels, table cells, equation numbers: kept, but in their own passage
}

export interface Passage {
  pid: string
  page: number
  text: string
  charStart: number
  charEnd: number
  bboxes: Box[] // one per line
  lineStarts: number[] // offset of each line inside `text` (for quote-level highlights)
  words: number
  kind: "text" | "figure"
}

export interface PageInfo {
  page: number
  width: number
  height: number
  rotate: number
  readRotation: number
  items: number
  rotatedItemsDropped: number
  overlapDropped: number
  inkDropped: number
  headerFooterDropped: number
  hasText: boolean
}

export interface Extracted {
  pages: PageInfo[]
  passages: Passage[]
  text: string // document text; passages are text.slice(charStart, charEnd)
}

const LIGATURES: Record<string, string> = {
  ﬀ: "ff",
  ﬁ: "fi",
  ﬂ: "fl",
  ﬃ: "ffi",
  ﬄ: "ffl",
  ﬅ: "st",
  ﬆ: "st",
}
export const fixLigatures = (s: string) => s.replace(/[ﬀ-ﬆ]/g, (c) => LIGATURES[c] ?? c)

// ---------------------------------------------------------------- transforms

type Mat = [number, number, number, number, number, number]
const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
]
const apply = (m: Mat, x: number, y: number): [number, number] => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
]

/** PDF user-space rectangle -> page space (top-left, rotation applied, scale 1). */
export function pdfRectToPage(viewportTransform: Mat, r: Box): Box {
  const pts = [
    apply(viewportTransform, r[0], r[1]),
    apply(viewportTransform, r[2], r[3]),
    apply(viewportTransform, r[0], r[3]),
    apply(viewportTransform, r[2], r[1]),
  ]
  const xs = pts.map((p) => p[0]),
    ys = pts.map((p) => p[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

const ASCENT = 0.8,
  DESCENT = 0.2 // pdf.js text layer default when font metrics are unknown

/** One pdf.js TextItem -> Item in page space, using the full text matrix. */
function toItem(
  vt: Mat,
  it: { str: string; transform: number[]; width: number; height: number; fontName: string },
  idx: number,
): Item {
  const tm = it.transform as Mat
  const m = mul(vt, tm) // text space -> page space
  const fsUser = Math.hypot(tm[2], tm[3]) || it.height || 1
  // baseline direction and "up" direction in user space
  const ux = tm[0],
    uy = tm[1],
    ul = Math.hypot(ux, uy) || 1
  const vx = tm[2],
    vy = tm[3],
    vl = Math.hypot(vx, vy) || 1
  const w = it.width
  const ox = tm[4],
    oy = tm[5]
  const corner = (a: number, b: number) =>
    apply(vt, ox + (ux / ul) * a + (vx / vl) * b, oy + (uy / ul) * a + (vy / vl) * b)
  const pts = [
    corner(0, -DESCENT * fsUser),
    corner(w, -DESCENT * fsUser),
    corner(0, ASCENT * fsUser),
    corner(w, ASCENT * fsUser),
  ]
  const xs = pts.map((p) => p[0]),
    ys = pts.map((p) => p[1])
  const scale = Math.hypot(vt[0], vt[1])
  const angle = Math.round((Math.atan2(m[1], m[0]) * 180) / Math.PI)
  return {
    str: it.str,
    box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    fs: fsUser * scale,
    angle,
    idx,
    font: it.fontName,
  }
}

const invert = (m: Mat): Mat => {
  const det = m[0] * m[3] - m[1] * m[2]
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ]
}
const mapBox = (m: Mat, b: Box): Box => {
  const pts = [
    apply(m, b[0], b[1]),
    apply(m, b[2], b[1]),
    apply(m, b[0], b[3]),
    apply(m, b[2], b[3]),
  ]
  const xs = pts.map((p) => p[0]),
    ys = pts.map((p) => p[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

/**
 * Items for one page. Lines are built in a "reading frame" where the page's dominant text direction is
 * horizontal (handles sideways tables / mis-rotated scans); `toDisplay` maps reading-frame boxes back to
 * the display frame (viewport with the page's own /Rotate), which is what we store.
 */
export async function pageItems(page: PDFPageProxy): Promise<{
  items: Item[]
  width: number
  height: number
  rotate: number
  readRotation: number
  toDisplay: Mat
}> {
  const display = page.getViewport({ scale: 1, rotation: 0 }) // storage frame (0 degrees)
  const tc = await page.getTextContent()
  const raws = tc.items
    // biome-ignore lint/suspicious/noExplicitAny: pdf.js TextItem | TextMarkedContent union; only text items pass the filter
    .map((raw: any, i: number) => ({ raw, i }))
    .filter(({ raw }) => raw.str != null)
  let items = raws.map(({ raw, i }) => toItem(display.transform as Mat, raw, i))
  // dominant direction weighted by characters, snapped to 90
  const votes = new Map<number, number>()
  for (const it of items) {
    const a = (((Math.round(it.angle / 90) * 90) % 360) + 360) % 360
    votes.set(a, (votes.get(a) ?? 0) + it.str.length)
  }
  const dominant = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0
  let toDisplay: Mat = [1, 0, 0, 1, 0, 0]
  const readRotation = (360 - dominant) % 360
  if (dominant !== 0) {
    const reading = page.getViewport({ scale: 1, rotation: readRotation })
    items = raws.map(({ raw, i }) => toItem(reading.transform as Mat, raw, i))
    toDisplay = mul(display.transform as Mat, invert(reading.transform as Mat))
  }
  return {
    items,
    width: display.width,
    height: display.height,
    rotate: page.rotate,
    readRotation,
    toDisplay,
  }
}

/** unpdf StructuredTextItem -> Item. No rotation info is available, so angle is assumed 0. */
export function itemsFromUnpdf(vt: Mat, its: StructuredTextItem[]): Item[] {
  return its.map((it, i) => {
    const r: Box = [
      it.x,
      it.y - DESCENT * it.fontSize,
      it.x + it.width,
      it.y + ASCENT * it.fontSize,
    ]
    return {
      str: it.str,
      box: pdfRectToPage(vt, r),
      fs: it.fontSize * Math.hypot(vt[0], vt[1]),
      angle: 0,
      idx: i,
      font: it.fontFamily,
    }
  })
}

// ---------------------------------------------------------------- lines

const vOverlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1])) /
  Math.max(0.01, Math.min(a[3] - a[1], b[3] - b[1]))
const union = (a: Box, b: Box): Box => [
  Math.min(a[0], b[0]),
  Math.min(a[1], b[1]),
  Math.max(a[2], b[2]),
  Math.max(a[3], b[3]),
]
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? (s[Math.floor(s.length / 2)] as number) : 0
}

const GAP_MAX = 1.0 // in em: a larger horizontal gap splits the line (column gutter, table cell)

function lineText(items: Item[]): string {
  let out = ""
  let prev: Item | null = null
  for (const it of items) {
    if (prev) {
      const gap = it.box[0] - prev.box[2]
      const needSpace =
        gap > 0.15 * Math.min(prev.fs, it.fs) && !/\s$/.test(out) && !/^\s/.test(it.str)
      if (needSpace) out += " "
    }
    out += it.str
    prev = it
  }
  // Symbol-font glyphs (±, ×) can arrive as control characters: a space reads and quotes cleanly.
  return fixLigatures(out)
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function mkLine(items: Item[]): Line {
  items.sort((a, b) => a.box[0] - b.box[0])
  const box = items.map((i) => i.box).reduce(union)
  // dominant font size = size covering most characters
  const fs = median(items.flatMap((i) => Array(Math.max(1, i.str.length)).fill(i.fs)))
  return { items, box, fs, text: lineText(items), idx: Math.min(...items.map((i) => i.idx)) }
}

export function buildLines(items: Item[]): Line[] {
  // 1) stream-order pass: join an item to the current line if same row and small gap
  const groups: Item[][] = []
  let cur: Item[] = []
  let curBox: Box | null = null
  for (const it of items) {
    if (!it.str.trim()) continue
    if (curBox) {
      const fs = Math.min(it.fs, median(cur.map((c) => c.fs)))
      const gap = it.box[0] - curBox[2]
      if (vOverlap(it.box, curBox) > 0.4 && gap > -0.5 * fs && gap < GAP_MAX * fs) {
        cur.push(it)
        curBox = union(curBox, it.box)
        continue
      }
      groups.push(cur)
    }
    cur = [it]
    curBox = it.box
  }
  if (cur.length) groups.push(cur)
  // 2) merge pass: fragments on the same row that touch horizontally (out-of-order streams, sub/superscripts)
  const lines = groups.map(mkLine)
  let merged = true
  while (merged) {
    merged = false
    lines.sort((a, b) => a.box[0] - b.box[0])
    outer: for (let i = 0; i < lines.length; i++) {
      for (let j = 0; j < lines.length; j++) {
        if (i === j) continue
        const a = lines[i]!,
          b = lines[j]!
        const fs = Math.min(a.fs, b.fs)
        const gap = b.box[0] - a.box[2]
        if (
          vOverlap(a.box, b.box) > 0.5 &&
          gap > -0.5 * fs &&
          gap < GAP_MAX * fs &&
          b.box[0] >= a.box[0]
        ) {
          lines[i] = mkLine([...a.items, ...b.items])
          lines.splice(j, 1)
          merged = true
          break outer
        }
      }
    }
  }
  return lines.sort((a, b) => a.idx - b.idx)
}

/** Two real text lines never overlap. When they do, the smaller one is usually invisible text
 *  (clipped labels inside an embedded figure PDF). Drop the narrower line of each overlapping pair. */
export function dropOverlaps(lines: Line[]): { kept: Line[]; dropped: number } {
  const area = (b: Box) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1])
  const drop = new Set<Line>()
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i]!.box,
        b = lines[j]!.box
      const ix = Math.min(a[2], b[2]) - Math.max(a[0], b[0]),
        iy = Math.min(a[3], b[3]) - Math.max(a[1], b[1])
      if (ix <= 0 || iy <= 0) continue
      if ((ix * iy) / Math.max(0.01, Math.min(area(a), area(b))) < 0.3) continue
      drop.add(a[2] - a[0] < b[2] - b[0] ? lines[i]! : lines[j]!)
    }
  return { kept: lines.filter((l) => !drop.has(l)), dropped: drop.size }
}

/** Ink check: drop lines whose box has (almost) no dark pixels in the rendered page (invisible / clipped text). */
export function dropInkless(
  lines: Line[],
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  scale: number,
): { kept: Line[]; dropped: number } {
  const kept = lines.filter((l) => {
    const b = l.dbox ?? l.box
    const x0 = Math.max(0, Math.floor(b[0] * scale)),
      x1 = Math.min(w, Math.ceil(b[2] * scale))
    const y0 = Math.max(0, Math.floor(b[1] * scale)),
      y1 = Math.min(h, Math.ceil(b[3] * scale))
    if (y1 - y0 < 5) return true // too small to judge at this render scale (tiny figure labels)
    let dark = 0,
      n = 0
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const k = (y * w + x) * 4
        const lum = 0.299 * rgba[k]! + 0.587 * rgba[k + 1]! + 0.114 * rgba[k + 2]!
        n++
        if (lum < 200) dark++
      }
    return n === 0 || dark / n > 0.01
  })
  return { kept, dropped: lines.length - kept.length }
}

// ---------------------------------------------------------------- paragraphs

const hOverlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) /
  Math.max(0.01, Math.min(a[2] - a[0], b[2] - b[0]))

export function buildParas(lines: Line[]): Para[] {
  // order lines top->bottom within column flow first: stream order is usually right for LaTeX/Word;
  // paragraphs are formed from consecutive lines that stack vertically.
  const paras: Para[] = []
  let p: Para | null = null
  for (const ln of lines) {
    if (p) {
      const last = p.lines[p.lines.length - 1]!
      const gapY = ln.box[1] - last.box[3]
      const sameFont = Math.abs(ln.fs - p.fs) <= 0.15 * p.fs
      const stacked = hOverlap(ln.box, last.box) > 0.3 || Math.abs(ln.box[0] - p.box[0]) < 2 * p.fs
      const indentStart =
        ln.box[0] - p.box[0] > 0.8 * p.fs && ln.box[0] - p.box[0] < 4 * p.fs && p.lines.length > 1
      const prevEndsShort = /[.!?:]["')\]]?$/.test(last.text) && last.box[2] < p.box[2] - 2 * p.fs
      if (
        gapY > -0.3 * p.fs &&
        gapY < 0.8 * p.fs &&
        sameFont &&
        stacked &&
        !indentStart &&
        !prevEndsShort &&
        !p.heading
      ) {
        p.lines.push(ln)
        p.box = union(p.box, ln.box)
        continue
      }
      paras.push(p)
    }
    p = { lines: [ln], box: ln.box, fs: ln.fs, heading: false, figure: false }
  }
  if (p) paras.push(p)
  // headings: single short line, larger font than the page body or ending without punctuation and followed by body
  const body = median(lines.flatMap((l) => Array(Math.max(1, l.text.length)).fill(l.fs)))
  for (const q of paras) {
    const words = q.lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0)
    q.heading =
      q.lines.length <= 2 &&
      words <= 14 &&
      (q.fs > body * 1.08 || /^(\d+(\.\d+)*\.?|[IVX]+\.|[A-Z]\.)\s+[A-Z]/.test(q.lines[0]!.text)) &&
      !/[.,;]$/.test(q.lines[q.lines.length - 1]!.text)
    const caption = /^(fig\.?|figure|table)\s*[\dIVX]+/i.test(q.lines[0]!.text)
    const letters = q.lines.reduce((n, l) => n + (l.text.match(/[A-Za-z]/g)?.length ?? 0), 0)
    const chars = q.lines.reduce((n, l) => n + l.text.length, 0)
    // a single short line of words (heading-ish, list tail) stays prose; figure = many short lines, tiny font or mostly digits/symbols
    const shortLines = words / q.lines.length < 3.5 && (q.lines.length >= 2 || q.fs < body * 0.92)
    q.figure =
      !q.heading &&
      !caption &&
      (shortLines || q.fs < body * 0.75 || letters / Math.max(1, chars) < 0.45)
  }
  return paras
}

/** Column-aware reading order: spanning blocks split the page into bands; inside a band, left column then right. */
export function readingOrder(paras: Para[]): Para[] {
  if (paras.length < 3) return paras
  const x0 = Math.min(...paras.map((p) => p.box[0])),
    x1 = Math.max(...paras.map((p) => p.box[2]))
  const mid = (x0 + x1) / 2,
    slack = (x1 - x0) * 0.04
  const side = (p: Para) => (p.box[2] <= mid + slack ? "L" : p.box[0] >= mid - slack ? "R" : "S")
  const lines = (s: string) =>
    paras.filter((p) => side(p) === s).reduce((n, p) => n + p.lines.length, 0)
  const twoCol = lines("L") >= 6 && lines("R") >= 6
  if (!twoCol) return paras // single column: keep stream order (it is reading order for Word/LaTeX output)
  const sorted = [...paras].sort((a, b) => a.box[1] - b.box[1])
  const out: Para[] = []
  let band: Para[] = []
  const flush = () => {
    const keep = (s: string) =>
      band.filter((p) => side(p) === s).sort((a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0])
    out.push(...keep("L"), ...keep("R"))
    band = []
  }
  for (const p of sorted) {
    if (side(p) === "S") {
      flush()
      out.push(p)
    } else band.push(p)
  }
  flush()
  return out
}

// ---------------------------------------------------------------- headers / footers

const hfKey = (l: Line, _pageHeight: number) =>
  `${Math.round(l.box[1] / 6)}|${l.text
    .toLowerCase()
    .replace(/\b[ivxlc]+\b/g, "#")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")}`
const HF_BAND = 0.15 // running headers/footers live in the top/bottom 15% of the page

export function headerFooterKeys(pagesLines: { lines: Line[]; height: number }[]): Set<string> {
  const counts = new Map<string, number>()
  for (const { lines, height } of pagesLines) {
    const seen = new Set<string>()
    for (const l of lines) {
      if (l.box[1] > height * HF_BAND && l.box[3] < height * (1 - HF_BAND)) continue
      const k = hfKey(l, height)
      if (!seen.has(k)) {
        seen.add(k)
        counts.set(k, (counts.get(k) ?? 0) + 1)
      }
    }
  }
  const n = pagesLines.length
  return new Set([...counts].filter(([, c]) => c >= 3 && c >= 0.4 * n).map(([k]) => k))
}

export const isMarginNoise = (l: Line, height: number) =>
  (l.box[1] < height * 0.08 || l.box[3] > height * 0.92) &&
  /^(page\s*)?(\d{1,4}|[ivxlc]{1,7})(\s*(of|\/)\s*\d{1,4})?$/i.test(l.text)

// ---------------------------------------------------------------- passages

const wc = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0)
const HYPH = /([A-Za-zÀ-ɏ])[-­‐]$/

export type HyphenMode = "auto" | "keep"
/** Words seen in the document; used to decide whether a line-end hyphen is a real one ("sharp-wave") or a break ("consoli-dation"). */
export function vocabulary(lines: Line[]): Set<string> {
  const v = new Set<string>()
  for (const l of lines)
    for (const w of l.text.toLowerCase().match(/[a-z\u00C0-\u024F]+(?:-[a-z\u00C0-\u024F]+)*/g) ??
      [])
      v.add(w)
  return v
}

/** Join lines with de-hyphenation; returns text plus each line's start offset.
 *  mode 'keep' (Gotenberg renditions: LibreOffice/Chromium do not auto-hyphenate) keeps the hyphen and drops the space.
 *  mode 'auto' (born-digital PDFs, LaTeX hyphenates): drop the hyphen unless the document uses "a-b" and never "ab". */
export function joinLines(
  lines: Line[],
  vocab?: Set<string>,
  mode: HyphenMode = "auto",
): { text: string; starts: number[] } {
  let text = ""
  const starts: number[] = []
  for (const l of lines) {
    if (text) {
      if (HYPH.test(text) && /^[a-z\u00DF-\u00FF]/.test(l.text)) {
        const left =
          text.match(/([A-Za-z\u00C0-\u024F]+)[-\u00AD\u2010]$/)?.[1]?.toLowerCase() ?? ""
        const right = l.text.match(/^[a-z\u00DF-\u00FF\u00C0-\u024F]+/)?.[0]?.toLowerCase() ?? ""
        const realHyphen =
          mode === "keep" || (!!vocab && vocab.has(`${left}-${right}`) && !vocab.has(left + right))
        if (!realHyphen || text.endsWith("\u00AD")) text = text.slice(0, -1) // "consoli-" + "dation"
      } else text += " "
    }
    starts.push(text.length)
    text += l.text
  }
  return { text, starts }
}

export const MIN_WORDS = 80,
  MAX_WORDS = 250

export function chunkPage(allParas: Para[]): { chunks: Line[][]; figure: Line[] } {
  const paras = allParas.filter((p) => !p.figure)
  const figure = allParas.filter((p) => p.figure).flatMap((p) => p.lines)
  const chunks: Line[][] = []
  let cur: Line[] = []
  let curWords = 0
  const flush = () => {
    if (cur.length) chunks.push(cur)
    cur = []
    curWords = 0
  }
  for (let pi = 0; pi < paras.length; pi++) {
    const p = paras[pi]!
    const pw = p.lines.reduce((n, l) => n + wc(l.text), 0)
    if (p.heading) {
      if (curWords >= 40) flush()
      cur.push(...p.lines)
      curWords += pw
      continue
    }
    if (curWords + pw <= MAX_WORDS) {
      cur.push(...p.lines)
      curWords += pw
      if (curWords >= MIN_WORDS && pi + 1 < paras.length && paras[pi + 1]!.heading) flush()
      continue
    }
    if (curWords >= MIN_WORDS) flush()
    // add the paragraph line by line, cutting at a sentence end once past MIN, hard cut at MAX
    for (const l of p.lines) {
      const w = wc(l.text)
      if (curWords + w > MAX_WORDS) flush()
      cur.push(l)
      curWords += w
      if (curWords >= 150 && /[.!?]["')\]]?$/.test(l.text)) flush()
    }
  }
  flush()
  // fold a short tail into the previous chunk on the same page
  if (chunks.length > 1) {
    const last = chunks[chunks.length - 1]!
    const lw = last.reduce((n, l) => n + wc(l.text), 0)
    const pw = chunks[chunks.length - 2]!.reduce((n, l) => n + wc(l.text), 0)
    if (lw < 40 && pw + lw <= MAX_WORDS + 60) {
      chunks[chunks.length - 2]!.push(...last)
      chunks.pop()
    }
  }
  return { chunks, figure }
}

const round = (b: Box): Box => b.map((v) => Math.round(v * 10) / 10) as Box

export interface ExtractOptions {
  source?: "pdfjs" | "unpdf"
  unpdfItems?: StructuredTextItem[][]
  /** render each page (scale 0.5) and drop lines with no ink under them */
  inkCheck?: (
    page: PDFPageProxy,
  ) => Promise<{ rgba: Uint8ClampedArray; w: number; h: number; scale: number }>
  /** 'keep' for Gotenberg renditions (DOCX/PPTX/HTML), 'auto' for born-digital PDFs */
  hyphens?: HyphenMode
  /** called after each page is read (for "Reading page n of N") */
  onPage?: (page: number, total: number) => unknown
}

export async function extractPassages(
  pdf: PDFDocumentProxy,
  docId = "doc",
  opts: ExtractOptions = {},
): Promise<Extracted> {
  const perPage: { page: number; lines: Line[]; readHeight: number; info: PageInfo }[] = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n)
    let items: Item[],
      width: number,
      height: number,
      rotate: number,
      toDisplay: Mat = [1, 0, 0, 1, 0, 0],
      readRotation = 0
    if (opts.source === "unpdf" && opts.unpdfItems) {
      const vp = page.getViewport({ scale: 1, rotation: 0 })
      items = itemsFromUnpdf(vp.transform as Mat, opts.unpdfItems[n - 1]!)
      width = vp.width
      height = vp.height
      rotate = page.rotate
    } else ({ items, width, height, rotate, toDisplay, readRotation } = await pageItems(page))
    const flowItems = items.filter((i) => Math.abs(i.angle) <= 3) // drop rotated text (arXiv side stamp, rotated axis labels)
    const ov = dropOverlaps(buildLines(flowItems))
    let lines = ov.kept,
      inkDropped = 0
    // header/footer + margin tests below use display-frame boxes; paragraphs are rebuilt per page from these lines
    for (const l of lines) l.dbox = readRotation !== 0 ? mapBox(toDisplay, l.box) : l.box
    const sideways = readRotation % 180 !== 0
    const readHeight = sideways ? width : height
    if (opts.inkCheck && lines.length) {
      const r = await opts.inkCheck(page)
      const ink = dropInkless(lines, r.rgba, r.w, r.h, r.scale)
      lines = ink.kept
      inkDropped = ink.dropped
    }
    await opts.onPage?.(n, pdf.numPages)
    // Pages are CPU-bound: yield so other jobs and the queue heartbeat keep moving.
    await new Promise((resolve) => setImmediate(resolve))
    perPage.push({
      page: n,
      lines,
      readHeight,
      info: {
        page: n,
        width,
        height,
        rotate,
        readRotation,
        items: items.length,
        rotatedItemsDropped: items.length - flowItems.length,
        overlapDropped: ov.dropped,
        inkDropped,
        headerFooterDropped: 0,
        hasText: items.some((i) => i.str.trim()),
      },
    })
    page.cleanup()
  }
  const hf = headerFooterKeys(perPage.map((p) => ({ lines: p.lines, height: p.readHeight })))
  const passages: Passage[] = []
  let text = ""
  const vocab = vocabulary(perPage.flatMap((p) => p.lines))
  for (const pg of perPage) {
    const kept = pg.lines.filter(
      (l) => !hf.has(hfKey(l, pg.readHeight)) && !isMarginNoise(l, pg.readHeight),
    )
    pg.info.headerFooterDropped = pg.lines.length - kept.length
    const paras = readingOrder(buildParas(kept))
    const { chunks, figure } = chunkPage(paras)
    const tagged = [
      ...chunks.map((c) => ({ c, kind: "text" as const })),
      ...(figure.length ? [{ c: figure, kind: "figure" as const }] : []),
    ]
    for (const { c: chunk, kind } of tagged) {
      const j = joinLines(chunk, vocab, opts.hyphens ?? "auto")
      if (!j.text.trim()) continue
      if (text) text += "\n\n"
      const charStart = text.length
      text += j.text
      passages.push({
        pid: `${docId}:p${pg.page}:${passages.filter((p) => p.page === pg.page).length}`,
        page: pg.page,
        text: j.text,
        charStart,
        charEnd: text.length,
        bboxes: chunk.map((l) => round(l.dbox ?? l.box)),
        lineStarts: j.starts,
        words: wc(j.text),
        kind,
      })
    }
  }
  return { pages: perPage.map((p) => p.info), passages, text }
}

/** Zetaris evidence shape. */
export function toZetaris(
  ex: Extracted,
  meta: { doc_id: string; owner: string; kind: string; title: string },
) {
  return {
    ...meta,
    pages: ex.pages.map((pg) => ({
      page: pg.page,
      width: Math.round(pg.width * 10) / 10,
      height: Math.round(pg.height * 10) / 10,
      rotate: pg.rotate, // the page's own /Rotate; bboxes are in the 0-degree frame (EmbedPDF applies rotation)
      passages: ex.passages
        .filter((p) => p.page === pg.page)
        .map((p) => ({
          pid: p.pid,
          kind: p.kind,
          text: p.text,
          bbox: p.bboxes,
          char_start: p.charStart,
          char_end: p.charEnd,
        })),
    })),
  }
}

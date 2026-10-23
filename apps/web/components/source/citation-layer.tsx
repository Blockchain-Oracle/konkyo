import type { SourcePassage } from "@/lib/use-source"

/** Room around each line so the mark covers ascenders and descenders, like a real highlighter. */
const PAD = 1.5

/**
 * The cited passage, marked line by line in amber (plan §7.4 #2). Boxes are PDF points in the
 * page's unrotated frame, so they only need the zoom applied; `Rotate` turns them with the page.
 * Multiply blending keeps the printed text fully dark under the mark.
 */
/**
 * Where the quoted words sit in the passage's text, tolerant of case and line breaks; null when
 * the quote can't be placed (then the whole passage is marked).
 */
function quoteRange(text: string, quote: string): [number, number] | null {
  let flat = ""
  const at: number[] = []
  let space = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string
    if (/\s/.test(ch)) {
      if (!space) {
        flat += " "
        at.push(i)
      }
      space = true
    } else {
      flat += ch.toLowerCase()
      at.push(i)
      space = false
    }
  }
  const q = quote.toLowerCase().replace(/\s+/g, " ").trim()
  const start = q ? flat.indexOf(q) : -1
  if (start < 0) return null
  return [at[start] as number, (at[start + q.length - 1] as number) + 1]
}

/** Only the lines the quote spans (one box per line, offsets from `lineStarts`). */
export function boxesFor(passage: SourcePassage, quote?: string) {
  const boxes = passage.bboxes ?? []
  const starts = passage.lineStarts
  const range = quote && starts?.length === boxes.length ? quoteRange(passage.text, quote) : null
  if (!range || !starts) return boxes
  const picked = boxes.filter((_, i) => {
    const lineStart = starts[i] ?? 0
    const lineEnd = starts[i + 1] ?? passage.text.length
    return lineStart < range[1] && lineEnd > range[0]
  })
  return picked.length ? picked : boxes
}

export function CitationLayer({
  passage,
  quote,
  scale,
}: {
  fileId: string
  passage: SourcePassage
  quote?: string
  scale: number
}) {
  const boxes = boxesFor(passage, quote)
  return (
    <div className="pointer-events-none absolute inset-0 mix-blend-multiply" aria-hidden>
      {boxes.map(([x0, y0, x1, y1], line) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: one box per line, in reading order
          key={line}
          className="absolute animate-sweep rounded-[2px] bg-highlight"
          style={{
            left: x0 * scale - PAD,
            top: y0 * scale - PAD,
            width: (x1 - x0) * scale + PAD * 2,
            height: (y1 - y0) * scale + PAD * 2,
            animationDelay: `${line * 40}ms`,
          }}
        />
      ))}
    </div>
  )
}

/** The person's own highlights on a page, in the "mark" blue (amber is kept for citations). */
export function MarkLayer({
  rects,
  scale,
}: {
  rects: [number, number, number, number][]
  scale: number
}) {
  return (
    <div className="pointer-events-none absolute inset-0 mix-blend-multiply" aria-hidden>
      {rects.map(([x0, y0, x1, y1], i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: one box per line segment, in order
          key={i}
          className="absolute rounded-[2px] bg-mark"
          style={{
            left: x0 * scale - PAD / 2,
            top: y0 * scale - PAD / 2,
            width: (x1 - x0) * scale + PAD,
            height: (y1 - y0) * scale + PAD,
          }}
        />
      ))}
    </div>
  )
}

import type { SourcePassage } from "@/lib/use-source"

/** Room around each line so the mark covers ascenders and descenders, like a real highlighter. */
const PAD = 1.5

/**
 * The cited passage, marked line by line in amber (plan §7.4 #2). Boxes are PDF points in the
 * page's unrotated frame, so they only need the zoom applied; `Rotate` turns them with the page.
 * Multiply blending keeps the printed text fully dark under the mark.
 */
export function CitationLayer({
  passage,
  scale,
}: {
  fileId: string
  passage: SourcePassage
  scale: number
}) {
  const boxes = passage.bboxes ?? []
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

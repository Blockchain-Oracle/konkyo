"use client"

import type { Matrix, MatrixCell, MatrixSource, Stance } from "@konkyo/agents"
import { Button } from "@konkyo/ui/components/button"
import { cn } from "@konkyo/ui/lib/utils"
import { CheckIcon, CopyIcon, MinusIcon, XIcon } from "lucide-react"
import { useState } from "react"
import { whereIs } from "@/lib/format"
import { openSource } from "@/lib/preview"

const STANCE: Record<Stance, { word: string; className: string; glyph: React.ReactNode }> = {
  agrees: {
    word: "Agrees",
    className: "text-supports-text",
    glyph: <CheckIcon className="size-3.5" strokeWidth={2.25} aria-hidden />,
  },
  disagrees: {
    word: "Disagrees",
    className: "text-contradicts",
    glyph: <XIcon className="size-3.5" strokeWidth={2.25} aria-hidden />,
  },
  partly: {
    word: "Partly",
    className: "text-partly",
    // A half-filled circle: supports it, with a limit.
    glyph: (
      <svg viewBox="0 0 14 14" className="size-3.5" aria-hidden>
        <circle cx="7" cy="7" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M7 1.75a5.25 5.25 0 0 1 0 10.5z" fill="currentColor" />
      </svg>
    ),
  },
}

/** Three to six words of the quote, so the cell reads at a glance; the full quote is on hover. */
const shortQuote = (quote: string) => {
  const words = quote.split(/\s+/)
  return words.length > 6 ? `${words.slice(0, 6).join(" ")}…` : quote
}

const sourceName = (s: MatrixSource) => s.byline ?? s.title

function open(cell: MatrixCell, source: MatrixSource) {
  openSource({
    fileId: cell.fileId,
    title: source.title,
    kind: source.kind as Parameters<typeof openSource>[0]["kind"],
    passageId: cell.passageId,
    quote: cell.quote,
  })
}

function Cell({ cell, source }: { cell?: MatrixCell; source: MatrixSource }) {
  if (!cell)
    return (
      <span className="inline-flex items-center gap-1 text-meta text-ash-gray/70">
        <MinusIcon className="size-3" strokeWidth={1.5} aria-hidden />
        Not addressed
      </span>
    )
  const stance = STANCE[cell.stance]
  if (cell.state === "checking")
    return <span className="animate-checking text-meta text-partly">checking…</span>
  return (
    <button
      type="button"
      onClick={() => open(cell, source)}
      title={`“${cell.quote}” (${source.title}${whereIs(cell) ? `, ${whereIs(cell)}` : ""})`}
      className="group/cell -m-1.5 block rounded-md p-1.5 text-left transition-colors duration-(--duration-press) hover:bg-overlay focus-visible:ring-1 focus-visible:ring-silver-mist focus-visible:outline-none"
    >
      <span className={cn("inline-flex items-center gap-1 text-snippet", stance.className)}>
        {stance.glyph}
        {stance.word}
      </span>
      <span className="mt-0.5 block text-meta text-silver-mist group-hover/cell:text-bone-white">
        “{shortQuote(cell.quote)}”
      </span>
      <span className="mt-0.5 block text-meta text-ash-gray">
        {cell.cites} cit.{whereIs(cell) ? ` · ${whereIs(cell)}` : ""}
      </span>
    </button>
  )
}

function asCsv(matrix: Matrix) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
  const head = [
    "Claim",
    ...matrix.sources.map((s) => `${s.title}${s.byline ? ` (${s.byline})` : ""}`),
  ]
  const rows = matrix.claims.map((c) => [
    c.text,
    ...matrix.sources.map((s) => {
      const cell = c.cells.find((x) => x.fileId === s.fileId)
      return cell ? `${STANCE[cell.stance].word}: “${cell.quote}”` : "Not addressed"
    }),
  ])
  return [head, ...rows].map((r) => r.map(esc).join(",")).join("\n")
}

/**
 * Where the sources agree and where they disagree (plan F13, §7.4 #4): claims down the side,
 * sources across, each cell a stance and the words that show it. Only quotes found in their
 * passage and in Zetaris reach a cell; a cell opens its passage in the source pane. There is no
 * consensus score: one number would hide the disagreement, which is the point.
 */
export function AgreeMatrix({ matrix }: { matrix: Matrix }) {
  const [copied, setCopied] = useState(false)
  if (!matrix.claims.length) return null
  const { counts } = matrix
  const summary = [
    `${counts.claims} claim${counts.claims === 1 ? "" : "s"}`,
    `${counts.sources} sources`,
    `${counts.agree} agree`,
    `${counts.disagree} disagree`,
    counts.partly ? `${counts.partly} partly` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    // In the reading column: more sources than fit scroll sideways inside the table's own frame.
    <section aria-label="Where the sources agree and disagree" className="mt-6">
      <div className="flex items-center gap-2">
        <h3 className="text-micro text-saffron-spark uppercase">Agree / disagree</h3>
        <span className="flex-1 text-meta text-ash-gray">
          {matrix.state === "checking" ? "Checking quotes…" : summary}
        </span>
        {matrix.state === "done" && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-snippet text-ash-gray hover:text-bone-white"
            onClick={async () => {
              await navigator.clipboard.writeText(asCsv(matrix))
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
          >
            {copied ? <CheckIcon className="text-supports" /> : <CopyIcon strokeWidth={1.5} />}
            {copied ? "Copied" : "Copy CSV"}
          </Button>
        )}
      </div>

      {/* Desktop: a real table, the claim column stays put while sources scroll. */}
      <div className="mt-3 hidden overflow-x-auto rounded-xl border border-border md:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              <th
                scope="col"
                className="sticky left-0 z-10 min-w-56 bg-panel px-3 py-2.5 text-meta font-normal text-ash-gray"
              >
                Claim
              </th>
              {matrix.sources.map((s) => (
                <th
                  key={s.fileId}
                  scope="col"
                  className="min-w-40 bg-panel px-3 py-2.5 align-bottom font-normal"
                >
                  <span className="line-clamp-1 text-snippet text-silver-mist" title={s.title}>
                    {sourceName(s)}
                  </span>
                  {s.byline && (
                    <span className="line-clamp-1 text-meta text-ash-gray" title={s.title}>
                      {s.title}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.claims.map((claim) => (
              <tr key={claim.id} className="border-b border-border last:border-0">
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-background px-3 py-3 align-top font-normal"
                >
                  <span className="line-clamp-2 text-snippet text-bone-white">{claim.text}</span>
                </th>
                {matrix.sources.map((s) => (
                  <td key={s.fileId} className="px-3 py-3 align-top">
                    <Cell cell={claim.cells.find((c) => c.fileId === s.fileId)} source={s} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phones: one card per claim, each source a line. */}
      <ul className="mt-3 space-y-2 md:hidden">
        {matrix.claims.map((claim) => (
          <li key={claim.id} className="rounded-xl border border-border bg-panel p-3">
            <p className="text-snippet text-bone-white">{claim.text}</p>
            <ul className="mt-2.5 space-y-2.5">
              {matrix.sources.map((s) => (
                <li key={s.fileId}>
                  <p className="text-meta text-ash-gray">{sourceName(s)}</p>
                  <div className="mt-1">
                    <Cell cell={claim.cells.find((c) => c.fileId === s.fileId)} source={s} />
                  </div>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  )
}

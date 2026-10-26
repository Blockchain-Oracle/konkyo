"use client"

import type { Citation } from "@konkyo/agents"
import { Fragment } from "react"
import { CitationChip } from "./citation-chip"

const MARKER = /\[(\d+)\]/g
const segmenter = new Intl.Segmenter("en", { granularity: "sentence" })

/** A line of answer text with its [n] markers drawn as citation chips. */
function WithChips({ text, citations }: { text: string; citations?: Map<number, Citation> }) {
  const out: React.ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(MARKER)) {
    const n = Number(m[1])
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(<CitationChip key={`${m.index}-${n}`} n={n} citation={citations?.get(n)} />)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out}</>
}

/**
 * The answer's paragraphs. While streaming, chips read "checking"; once verified they carry
 * their source. Sentences the Verifier sent back and the Writer rewrote resolve from a blur
 *so the correction is seen, not hidden.
 */
export function AnswerText({
  body,
  citations,
  rewritten = [],
  streaming = false,
}: {
  body: string
  citations?: Citation[]
  rewritten?: string[]
  streaming?: boolean
}) {
  const byN = citations ? new Map(citations.map((c) => [c.n, c])) : undefined
  const changed = new Set(rewritten.map((t) => t.trim()))
  const paragraphs = body.split(/\n{2,}/).filter((p) => p.trim())
  return (
    <div className="space-y-4 text-reading text-silver-mist">
      {paragraphs.map((paragraph, pi) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs keep their order while streaming
        <p key={pi}>
          {[...segmenter.segment(paragraph)].map(({ segment }, si) => {
            const isRewritten = changed.has(segment.trim())
            return (
              <Fragment
                // biome-ignore lint/suspicious/noArrayIndexKey: sentences keep their order
                key={si}
              >
                {isRewritten ? (
                  <span className="animate-rewrite" title="Rewritten after the Verifier's check">
                    <WithChips text={segment} citations={byN} />
                  </span>
                ) : (
                  <WithChips text={segment} citations={byN} />
                )}
              </Fragment>
            )
          })}
          {streaming && pi === paragraphs.length - 1 && (
            <span
              aria-hidden
              className="ml-0.5 inline-block h-[1em] w-[0.4em] translate-y-[0.15em] animate-checking rounded-[1px] bg-silver-mist/60"
            />
          )}
        </p>
      ))}
    </div>
  )
}

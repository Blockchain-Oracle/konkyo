"use client"

import type { CSSProperties, ReactNode } from "react"
import type { PartValue, StageCardData, StagePart, StageSource } from "@/lib/voice-stage"

/**
 * The cards a spoken ask builds on the voice stage (plan §16.5, "Cards per intent"): Konkyo's own
 * paper objects, each with a skeleton row for every part that hasn't landed. A part shows once the
 * stage's reveal has let it in (`shown`), so rows arrive one per beat even when the pipeline hands
 * over several at once. The wrapper classes are the ones the ported stage CSS sizes and lands
 * (`.widget-group` > `.widget-group-body`).
 */

/** Each kind's own size; the stage scales it up to fit its right half. */
export const CARD_SIZE = {
  ask: { w: 380, h: 340 },
  find: { w: 360, h: 330 },
  quiz: { w: 320, h: 270 },
  note: { w: 300, h: 260 },
  brief: { w: 320, h: 260 },
  space: { w: 300, h: 250 },
  remember: { w: 300, h: 200 },
} as const

type Shown = Record<string, PartValue>

function Skel({ w = "100%", tall = false }: { w?: string; tall?: boolean }) {
  return (
    <span
      className={`vcard-skel${tall ? " is-tall" : ""}`}
      style={{ width: w }}
      aria-hidden="true"
    />
  )
}

/** A part's value once it is shown, else a skeleton. */
function show(
  shown: Shown,
  id: string,
  render: (v: PartValue) => ReactNode,
  skel: ReactNode = <Skel />,
) {
  return id in shown ? render(shown[id] as PartValue) : skel
}

function host(url?: string) {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : undefined
  } catch {
    return undefined
  }
}

/** A found source's mark: the site's own favicon, or its monogram when there is none. */
function SourceMark({ source }: { source: StageSource }) {
  const site = source.host
  const letter = (site ?? source.title)
    .replace(/^www\./, "")
    .slice(0, 1)
    .toUpperCase()
  if (source.kind === "paper" || !site)
    return (
      <span className="vcard-mark is-paper" aria-hidden="true">
        {letter}
      </span>
    )
  return (
    <span className="vcard-mark" aria-hidden="true">
      {/* biome-ignore lint/performance/noImgElement: a remote favicon at 16 px; next/image adds nothing here */}
      <img
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(site)}&sz=64`}
        alt=""
        width={16}
        height={16}
        loading="lazy"
        onError={(e) => {
          e.currentTarget.replaceWith(document.createTextNode(letter))
        }}
      />
    </span>
  )
}

function Paper({
  kind,
  size,
  tone,
  children,
}: {
  kind: string
  size: { w: number; h: number }
  tone?: string
  children: ReactNode
}) {
  return (
    <div className="widget-group" style={{ width: size.w }}>
      <div className="widget-group-body">
        <article
          className={`widget-shell vcard vcard-${kind}`}
          style={{ minHeight: size.h, ...(tone ? { "--tone": tone } : {}) } as CSSProperties}
        >
          {children}
        </article>
      </div>
    </div>
  )
}

/** "[3]" markers in an answer as small chips; the rest as text. */
function AnswerText({ text }: { text: string }) {
  const bits = text.split(/(\[\d+\])/g)
  return (
    <p className="vcard-answer">
      {bits.map((bit, i) => {
        const n = /^\[(\d+)\]$/.exec(bit)?.[1]
        return n ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: the text's own order
          <b key={i} className="vcard-cite">
            {n}
          </b>
        ) : (
          bit
        )
      })}
    </p>
  )
}

export function StageCardBody({
  card,
  shown,
  parts,
  size,
}: {
  card: StageCardData
  shown: Shown
  parts: StagePart[]
  size: { w: number; h: number }
}) {
  const final = (id: string) => parts.find((p) => p.id === id)?.status === "final"
  switch (card.kind) {
    case "ask": {
      const sources = parts.filter((p) => p.id.startsWith("source-"))
      return (
        <Paper kind="ask" size={size}>
          <p className="vcard-kicker">
            <i aria-hidden="true" />
            {show(shown, "scope", (v) => `reading ${v}`, <Skel w="46%" />)}
          </p>
          <h3 className="vcard-title">
            {show(shown, "question", (v) => String(v), <Skel w="80%" tall />)}
          </h3>
          <ul className="vcard-chips" aria-label="Sources it is reading">
            {sources.length
              ? sources.map((p, i) =>
                  p.id in shown ? (
                    <li key={p.id} className="vcard-chip">
                      <b>{i + 1}</b>
                      <span>{String(shown[p.id])}</span>
                    </li>
                  ) : (
                    <li key={p.id}>
                      <Skel w="74px" />
                    </li>
                  ),
                )
              : [0, 1, 2].map((i) => (
                  <li key={i}>
                    <Skel w="74px" />
                  </li>
                ))}
          </ul>
          {card.notFound ? (
            <p className="vcard-answer is-quiet">Nothing in these sources answers that.</p>
          ) : (
            show(
              shown,
              "answer",
              (v) => <AnswerText text={String(v)} />,
              <span className="vcard-lines">
                <Skel />
                <Skel w="92%" />
                <Skel w="64%" />
              </span>,
            )
          )}
          <p className={`vcard-receipt${final("receipt") ? " is-final" : ""}`}>
            {show(
              shown,
              "receipt",
              (v) => (
                <>
                  <span aria-hidden="true">✓</span> checked {v} quote{v === 1 ? "" : "s"}
                </>
              ),
              <>checking quotes…</>,
            )}
          </p>
        </Paper>
      )
    }
    case "find":
      return (
        <Paper kind="find" size={size}>
          <p className="vcard-kicker">
            <i aria-hidden="true" />
            {show(shown, "into", (v) => `saving to ${v}`, <Skel w="40%" />)}
          </p>
          <h3 className="vcard-title">
            {show(shown, "topic", (v) => String(v), <Skel w="70%" tall />)}
          </h3>
          <ul className="vcard-rows" aria-label="Sources found">
            {(card.found.length ? card.found : [null, null, null]).slice(-5).map((s, i) => {
              const id = `found-${card.found.length > 5 ? card.found.length - 5 + i : i}`
              return s && id in shown ? (
                <li key={id} className="vcard-row">
                  <SourceMark source={{ ...s, host: s.host ?? host(s.detail) }} />
                  <span className="vcard-row-text">
                    <b>{s.title}</b>
                    {s.detail && <small>{s.detail}</small>}
                  </span>
                </li>
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows hold places
                <li key={`s${i}`} className="vcard-row">
                  <Skel w="16px" />
                  <Skel w={`${70 - i * 12}%`} />
                </li>
              )
            })}
          </ul>
          <p className={`vcard-receipt${final("added") ? " is-final" : ""}`}>
            {show(
              shown,
              "added",
              (v) => `added ${v} to ${card.into}`,
              card.found.length ? `found ${card.found.length}` : "searching…",
            )}
          </p>
        </Paper>
      )
    case "quiz":
      return (
        <Paper kind="quiz" size={size}>
          <p className="vcard-kicker">
            <i aria-hidden="true" />
            {show(shown, "scope", (v) => `practice · ${v}`, <Skel w="44%" />)}
          </p>
          <h3 className="vcard-title">
            {show(shown, "topic", (v) => String(v) || "everything here", <Skel w="64%" tall />)}
          </h3>
          <p className="vcard-count">
            {show(
              shown,
              "made",
              (v) => (
                <>
                  <b>{v}</b>
                  <span>checked question{v === 1 ? "" : "s"} made</span>
                </>
              ),
              <>
                <b className="is-waiting">0</b>
                <span>making questions…</span>
              </>,
            )}
          </p>
          <p className={`vcard-go${card.ready ? " is-ready" : ""}`}>
            {card.ready
              ? "start the round ▸"
              : "start" in shown
                ? "it keeps making them in study ▸"
                : "making the first six"}
          </p>
        </Paper>
      )
    case "note":
      return (
        <Paper kind="note" size={size}>
          <span className="vcard-tape" aria-hidden="true" />
          <p className="vcard-kicker">
            {show(shown, "where", (v) => `a note in ${v}`, <Skel w="50%" />)}
          </p>
          <h3 className="vcard-title">
            {show(shown, "title", (v) => String(v) || "untitled", <Skel w="76%" tall />)}
          </h3>
          <span className="vcard-lines is-ruled">
            <Skel />
            <Skel w="86%" />
            <Skel w="58%" />
          </span>
          <p className={`vcard-go${"open" in shown ? " is-ready" : ""}`}>
            {"open" in shown ? "open it ▸" : "starting…"}
          </p>
        </Paper>
      )
    case "brief": {
      const steps = ["reading your sources", "writing the script", "two voices recording"]
      const at = card.status === "ready" ? 3 : card.status === "making" ? 1 : 0
      return (
        <Paper kind="brief" size={size}>
          <p className="vcard-kicker">
            <i aria-hidden="true" />
            {show(shown, "scope", (v) => `audio brief · ${v}`, <Skel w="52%" />)}
          </p>
          <ol className="vcard-steps">
            {steps.map((step, i) => (
              <li key={step} data-state={i < at ? "done" : i === at ? "now" : "next"}>
                {step}
              </li>
            ))}
          </ol>
          <p className={`vcard-go${card.status === "ready" ? " is-ready" : ""}`}>
            {card.status === "failed"
              ? "couldn't make it"
              : card.status === "ready"
                ? "listen ▸"
                : "about two minutes"}
          </p>
        </Paper>
      )
    }
    case "space":
      return (
        <Paper kind="space" size={size} tone={`var(--color-${card.color})`}>
          <span className="vcard-symbol" aria-hidden="true">
            {show(shown, "symbol", (v) => String(v), "·")}
          </span>
          <h3 className="vcard-title">
            {show(shown, "name", (v) => String(v), <Skel w="70%" tall />)}
          </h3>
          <p className="vcard-kicker">
            {show(shown, "color", () => "a new space", <Skel w="38%" />)}
          </p>
          <p className={`vcard-go${"ready" in shown ? " is-ready" : ""}`}>
            {"ready" in shown ? "go in ▸" : "making it…"}
          </p>
        </Paper>
      )
    case "remember":
      return (
        <Paper kind="remember" size={size}>
          <p className="vcard-kicker">it&apos;ll remember</p>
          <h3 className="vcard-title">
            {show(shown, "text", (v) => `“${v}”`, <Skel w="84%" tall />)}
          </h3>
          <p className={`vcard-go${"kept" in shown ? " is-ready" : ""}`}>
            {"kept" in shown ? "kept · see what it knows" : "keeping…"}
          </p>
        </Paper>
      )
  }
}

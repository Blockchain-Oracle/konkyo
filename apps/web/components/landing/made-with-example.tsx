"use client"

import { BRIEF, CONNECTORS, MODELS, NEMOTRON } from "@konkyo/config"
import { PauseIcon, PlayIcon } from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import type { Vendor } from "@/components/landing/vendor-logo"
import { clock } from "@/lib/format"
import brief from "@/lib/made-with-brief.json"
import { OPENALEX_TOPICS, ZETARIS_EXAMPLE } from "@/lib/made-with-examples"

/**
 * The hero example on each made-with page (plan F61), in OurSpaces' tilted card. Two are live
 * (Zetaris checks three quotes; OpenAlex searches), one plays a real brief Konkyo made, and the
 * rest show the app's own config and wording. Nothing here is invented output.
 */
export function MadeWithExample({ partner, caption }: { partner: Vendor; caption: string }) {
  const Example = EXAMPLES[partner]
  return (
    <div className="vendor-example">
      <div className="vendor-example-top">
        <span>{LIVE.has(partner) ? "live example" : "interactive example"}</span>
        <span>{partner} × konkyo</span>
      </div>
      <Example />
      <p className="vendor-example-caption">{caption}</p>
    </div>
  )
}

const LIVE = new Set<Vendor>(["zetaris", "openalex"])

function Tabs<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { id: T; label: ReactNode }[]
  value: T
  onChange: (id: T) => void
  label: string
}) {
  return (
    <fieldset className="vendor-example-tabs">
      <legend className="sr-only">{label}</legend>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={o.id === value}
          className={o.id === value ? "is-selected" : ""}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </fieldset>
  )
}

// ------------------------------------------------------------------ Zetaris: three quotes, one statement

type Check = { found: string[]; ms: number; sql: string; checkedAt: number }

/** A proxy's error page isn't JSON: read what there is, and fall back to the route's own words. */
const bodyOf = (res: Response) => res.json().catch(() => ({}))

/** The quote with the words a variant changed marked, against the one as written. */
function Marked({ text, against }: { text: string; against: string }) {
  if (text === against) return <>{text}</>
  const a = text.split(" ")
  const b = against.split(" ")
  return (
    <>
      {a.map((word, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: words of a fixed sentence
        <span key={i}>
          {i > 0 && " "}
          {word === b[i] ? word : <mark>{word}</mark>}
        </span>
      ))}
    </>
  )
}

function ZetarisExample() {
  const [check, setCheck] = useState<Check | null>(null)
  const [state, setState] = useState<"idle" | "checking" | "failed">("idle")
  const [error, setError] = useState("")
  const run = async () => {
    setState("checking")
    setCheck(null)
    try {
      const res = await fetch("/api/made-with/zetaris", { method: "POST" })
      const body = await bodyOf(res)
      if (!res.ok) throw new Error(body.error ?? "Zetaris didn't answer just now.")
      setCheck(body)
      setState("idle")
    } catch (e) {
      setError((e as Error).message)
      setState("failed")
    }
  }
  const [written] = ZETARIS_EXAMPLE.quotes
  return (
    <>
      <p className="mw-from">
        from <b>{ZETARIS_EXAMPLE.byline}</b>, a sample paper
      </p>
      <ol className="mw-quotes" aria-live="polite">
        {ZETARIS_EXAMPLE.quotes.map((q) => {
          const verdict = check ? (check.found.includes(q.id) ? "found" : "missing") : null
          return (
            <li key={q.id} className="mw-slip" data-verdict={verdict ?? undefined}>
              <small>{q.label}</small>
              <p>
                “<Marked text={q.text} against={written.text} />”
              </p>
              {verdict && (
                <strong className="mw-verdict">
                  {verdict === "found" ? "✓ found in the paper" : "✕ not in the paper"}
                </strong>
              )}
            </li>
          )
        })}
      </ol>
      <div className="mw-run">
        <button
          type="button"
          className="vendor-example-button"
          onClick={run}
          disabled={state === "checking"}
        >
          {state === "checking"
            ? "checking in Zetaris…"
            : check
              ? "check again"
              : "check in Zetaris"}{" "}
          <span aria-hidden>↗</span>
        </button>
        {check && (
          <p className="mw-stat">
            1 statement · 3 quotes · {check.ms.toLocaleString()} ms
            <CheckedAgo at={check.checkedAt} />
          </p>
        )}
        {state === "failed" && <p className="mw-stat">{error}</p>}
      </div>
      {check && (
        <details className="mw-sql">
          <summary>the statement Zetaris ran</summary>
          <pre>{check.sql}</pre>
        </details>
      )}
    </>
  )
}

/** A check shared from the last half minute says when it ran (the route keeps one at a time). */
function CheckedAgo({ at }: { at: number }) {
  const seconds = Math.round((Date.now() - at) / 1000)
  return seconds >= 3 ? <> · checked {seconds} s ago</> : null
}

// ------------------------------------------------------------------ Meterless: one correction

const MEMORY_STEPS = [
  { id: "mark", label: "you mark it" },
  { id: "kept", label: "H-MEM keeps it" },
  { id: "read", label: "the next answer reads it" },
] as const

// The app's own wording (memory.ts recordCorrection, answer.ts memoryBlock), with one example.
const ASKED = "Does a daytime nap help motor learning?"
const REASON = "Missed something"
const NOTE = "say which group each number is from"
const MEMORY = `About “${ASKED}”: an earlier answer was marked “${REASON}”. The person said: ${NOTE}.`

function MeterlessExample() {
  const [step, setStep] = useState<(typeof MEMORY_STEPS)[number]["id"]>("mark")
  return (
    <>
      <Tabs options={MEMORY_STEPS} value={step} onChange={setStep} label="Step" />
      <div className="mw-stage" key={step}>
        {step === "mark" && (
          <div className="mw-slip">
            <small>you asked</small>
            <p className="mw-strong">{ASKED}</p>
            <div className="mw-thumbs">
              <span aria-hidden>👎</span> what was wrong?
            </div>
            <div className="mw-chips">
              {["Not in the source", "Wrong source", "Missed something", "Not what I asked"].map(
                (r) => (
                  <span key={r} className={r === REASON ? "is-on" : ""}>
                    {r}
                  </span>
                ),
              )}
            </div>
            <p className="mw-typed">“{NOTE}”</p>
          </div>
        )}
        {step === "kept" && (
          <div className="mw-slip">
            <small>a memory in your H-MEM</small>
            <p>{MEMORY}</p>
            <dl className="mw-fields">
              <div>
                <dt>confidence</dt>
                <dd>0.8</dd>
              </div>
              <div>
                <dt>provenance</dt>
                <dd>Thumbs down on an answer</dd>
              </div>
              <div>
                <dt>tags</dt>
                <dd>correction · missed-something</dd>
              </div>
            </dl>
          </div>
        )}
        {step === "read" && (
          <div className="mw-slip">
            <small>what the Planner and Writer read first</small>
            <p className="mw-mono">
              What this person has corrected before (from their memory, not evidence; never cite
              it):
              <br />- {MEMORY}
            </p>
            <p className="mw-mono">Latest question: How much did the nap group improve?</p>
          </div>
        )}
      </div>
    </>
  )
}

// ------------------------------------------------------------------ NVIDIA: the Nemotron model per job

const ROLES = [
  {
    id: "planner",
    label: "Planner",
    does: "Plans the run",
    measured: "the only setup that passed every test: valid JSON 3/3, 0 false rejections",
  },
  {
    id: "writer",
    label: "Writer",
    does: "Writes the cited answer",
    measured: "9/9 quotes verbatim, citation format 3/3, refused a planted figure 3/3",
  },
  {
    id: "verifier",
    label: "Verifier",
    does: "Checks each claim's support",
    measured: "0/10 false rejections, 6/6 planted errors caught, thinking off",
  },
  {
    id: "analyst",
    label: "Analyst",
    does: "Lines up where sources agree",
    measured: "the same strict support judgement as the Verifier",
  },
  {
    id: "tutor",
    label: "Tutor",
    does: "Makes practice from passages",
    measured: "17 of 19 drafted items passed every check; Lightning's never did",
  },
  {
    id: "screener",
    label: "Screener",
    does: "Screens deep-search finds",
    measured: "reads one batch of abstracts per Markovian step",
  },
] as const

/** Nemotron's model ids, as people say them. */
const NAMES: Record<string, string> = {
  [NEMOTRON.super]: "Nemotron 3.5 Super",
  [NEMOTRON.ultra]: "Nemotron 3 Ultra",
  [NEMOTRON.lightning]: "Nemotron 3.5 Lightning",
}
const nameOf = (id: string) => NAMES[id] ?? id
const THINKING = { off: "thinking off", low: "thinks first (low effort)", high: "thinks first" }

function NvidiaExample() {
  const [role, setRole] = useState<(typeof ROLES)[number]["id"]>("writer")
  const picked = ROLES.find((r) => r.id === role) ?? ROLES[0]
  const { primary, fallback } = MODELS[role]
  return (
    <>
      <Tabs options={ROLES} value={role} onChange={setRole} label="Agent" />
      <div className="mw-stage" key={role}>
        <div className="mw-slip mw-model">
          <small>{picked.does}</small>
          <p className="mw-model-id">{nameOf(primary.id)}</p>
          <p className="mw-model-effort">{THINKING[primary.reasoning]}</p>
          <dl className="mw-fields">
            <div>
              <dt>why this one</dt>
              <dd>{picked.measured}</dd>
            </div>
            <div>
              <dt>if it fails</dt>
              <dd>
                {nameOf(fallback.id)} · {THINKING[fallback.reasoning]}
              </dd>
            </div>
          </dl>
        </div>
        <ul className="mw-roster" aria-label="Every agent's model">
          {ROLES.map((r) => (
            <li key={r.id} className={r.id === role ? "is-on" : ""}>
              <span>{r.label}</span>
              <span>{nameOf(MODELS[r.id].primary.id)}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

// ------------------------------------------------------------------ ElevenLabs: a real brief

type BriefLine = (typeof brief.lines)[number] & { source?: string; page?: number; quote?: string }

function ElevenLabsExample() {
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  const [now, setNow] = useState(0)
  const lines = brief.lines as BriefLine[]
  const at = Math.max(
    0,
    lines.findLastIndex((l) => l.start <= now + 0.05),
  )
  const line = lines[at] ?? lines[0]
  const toggle = () => {
    const el = audio.current
    if (!el) return
    setFailed(false)
    if (el.paused) el.play().catch(() => setFailed(true))
    else el.pause()
  }
  return (
    <>
      {/* biome-ignore lint/a11y/useMediaCaption: the transcript is the line shown below */}
      <audio
        ref={audio}
        src={brief.audio}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
      />
      <div className="mw-radio">
        <button
          type="button"
          className="mw-play"
          onClick={toggle}
          aria-label={playing ? "Pause the brief" : "Play the brief"}
        >
          {playing ? (
            <PauseIcon className="size-5 fill-current" />
          ) : (
            <PlayIcon className="size-5 translate-x-px fill-current" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className="mw-radio-title">{brief.title.toLowerCase()}</p>
          <div className="mw-radio-bar" aria-hidden>
            <i style={{ width: `${(now / brief.durationSeconds) * 100}%` }} />
          </div>
          <p className="mw-radio-time">
            {failed
              ? "the recording didn't load"
              : `${clock(now)} / ${clock(brief.durationSeconds)}`}
          </p>
        </div>
      </div>
      <div className="mw-slip mw-line" aria-live={playing ? "off" : "polite"}>
        <small>
          {line ? BRIEF.voices[line.speaker as "A" | "B"].name : ""} · line {at + 1} of{" "}
          {lines.length}
        </small>
        <p className="mw-strong">{line?.text}</p>
        {line?.quote ? (
          <p className="mw-cite">
            <b>
              {line.source}, p. {line.page}
            </b>
            <br />“{line.quote}”
          </p>
        ) : (
          <p className="mw-cite">an opening line: no fact, no citation</p>
        )}
      </div>
    </>
  )
}

// ------------------------------------------------------------------ Composio: three connectors

const KITS = [
  {
    id: "gmail",
    label: "Gmail",
    logo: "/logos/gmail.svg",
    version: CONNECTORS.versions.gmail,
    comes: "an email you pick, or every new match for a watch search",
    becomes: "a page with its headers, plus each attachment as its own source",
    tools: ["GMAIL_FETCH_EMAILS", "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID", "GMAIL_GET_ATTACHMENT"],
  },
  {
    id: "googledrive",
    label: "Drive",
    logo: "/logos/drive.svg",
    version: CONNECTORS.versions.googledrive,
    comes: "a file you pick, read again whenever it changes",
    becomes: "its own bytes; Google Docs, Sheets and Slides exported",
    tools: ["GOOGLEDRIVE_FIND_FILE", "GOOGLEDRIVE_DOWNLOAD_FILE"],
  },
  {
    id: "notion",
    label: "Notion",
    logo: "/logos/notion.svg",
    version: CONNECTORS.versions.notion,
    comes: "a page you pick, read again whenever it changes",
    becomes: "its Markdown, so headings and lists survive",
    tools: ["NOTION_SEARCH_NOTION_PAGE", "NOTION_GET_PAGE_MARKDOWN"],
  },
] as const

function ComposioExample() {
  const [kit, setKit] = useState<(typeof KITS)[number]["id"]>("gmail")
  const picked = KITS.find((k) => k.id === kit) ?? KITS[0]
  return (
    <>
      <Tabs
        options={KITS.map((k) => ({
          id: k.id,
          label: (
            <span className="inline-flex items-center gap-1.5">
              {/* biome-ignore lint/performance/noImgElement: tiny same-origin svg */}
              <img src={k.logo} alt="" width={14} height={14} />
              {k.label}
            </span>
          ),
        }))}
        value={kit}
        onChange={setKit}
        label="Connector"
      />
      <div className="mw-stage" key={kit}>
        <div className="mw-slip">
          <small>what comes in</small>
          <p className="mw-strong">{picked.comes}</p>
        </div>
        <span className="mw-down" aria-hidden>
          ↓
        </span>
        <div className="mw-slip">
          <small>what it becomes in your library</small>
          <p className="mw-strong">{picked.becomes}</p>
          <dl className="mw-fields">
            <div>
              <dt>tools</dt>
              <dd className="mw-mono">{picked.tools.join(" · ")}</dd>
            </div>
            <div>
              <dt>toolkit</dt>
              <dd className="mw-mono">{picked.version}</dd>
            </div>
          </dl>
        </div>
      </div>
    </>
  )
}

// ------------------------------------------------------------------ OpenAlex: a live search

type Work = {
  id: string
  title: string
  year: number | null
  venue: string | null
  cited: number
  doi: string | null
  authors: string
}

function OpenAlexExample() {
  const [topic, setTopic] = useState(0)
  const [works, setWorks] = useState<Work[] | null>(null)
  const [error, setError] = useState("")
  useEffect(() => {
    let live = true
    setWorks(null)
    setError("")
    fetch(`/api/made-with/openalex?topic=${topic}`)
      .then(async (res) => {
        const body = await bodyOf(res)
        if (!res.ok) throw new Error(body.error ?? "OpenAlex didn't answer just now.")
        if (live) setWorks(body.works)
      })
      .catch((e) => live && setError((e as Error).message))
    return () => {
      live = false
    }
  }, [topic])
  return (
    <>
      <Tabs
        options={OPENALEX_TOPICS.map((t, i) => ({ id: String(i), label: t }))}
        value={String(topic)}
        onChange={(id) => setTopic(Number(id))}
        label="Topic"
      />
      <ol className="mw-papers" aria-live="polite" aria-busy={!works && !error}>
        {error ? (
          <li className="mw-slip">
            <p>{error}</p>
          </li>
        ) : works && !works.length ? (
          <li className="mw-slip">
            <p>OpenAlex has no open-access papers with a PDF copy on this just now.</p>
          </li>
        ) : works ? (
          works.map((w) => (
            <li key={w.id} className="mw-slip mw-paper">
              <a
                href={w.doi ? `https://doi.org/${w.doi}` : `https://openalex.org/${w.id}`}
                target="_blank"
                rel="noreferrer"
              >
                {w.title}
              </a>
              <small>
                {[w.authors, w.year, w.venue].filter(Boolean).join(" · ")}
                {" · "}cited by {w.cited.toLocaleString()}
              </small>
              <span className="mw-pdf">open access · PDF copy</span>
            </li>
          ))
        ) : (
          [0, 1, 2].map((i) => <li key={i} className="mw-slip mw-paper is-waiting" />)
        )}
      </ol>
    </>
  )
}

const EXAMPLES: Record<Vendor, () => ReactNode> = {
  zetaris: ZetarisExample,
  meterless: MeterlessExample,
  nvidia: NvidiaExample,
  elevenlabs: ElevenLabsExample,
  composio: ComposioExample,
  openalex: OpenAlexExample,
}

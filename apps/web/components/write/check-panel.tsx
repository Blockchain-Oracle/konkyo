"use client"

import type { ClaimResult } from "@konkyo/agents"
import type { FileKind } from "@konkyo/config"
import { Button } from "@konkyo/ui/components/button"
import { cn } from "@konkyo/ui/lib/utils"
import {
  ArrowUpRightIcon,
  CheckIcon,
  ListChecksIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { openSource } from "@/lib/preview"
import type { CheckRun } from "@/lib/use-note"

type Row = CheckRun["results"] extends Map<string, infer V> ? V : never

const VERDICT = {
  checking: { word: "Checking", className: "text-partly animate-checking" },
  supported: { word: "Supported", className: "text-supports-text" },
  partly: { word: "Partly supported", className: "text-partly" },
  contradicted: { word: "Contradicted", className: "text-contradicts" },
  "not-found": { word: "Not found", className: "text-contradicts" },
} as const

function Glyph({ verdict }: { verdict: Row["verdict"] }) {
  if (verdict === "supported")
    return <CheckIcon className="size-3.5" strokeWidth={2.25} aria-hidden />
  if (verdict === "not-found") return <XIcon className="size-3.5" strokeWidth={2.25} aria-hidden />
  if (verdict === "contradicted")
    return (
      <svg viewBox="0 0 14 14" className="size-3.5" aria-hidden>
        <path d="M2 7h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  return (
    <svg viewBox="0 0 14 14" className="size-3.5" aria-hidden>
      <circle cx="7" cy="7" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.6" />
      {verdict === "partly" && <path d="M7 1.75a5.25 5.25 0 0 1 0 10.5z" fill="currentColor" />}
    </svg>
  )
}

/**
 * Check my draft's side list. Each
 * claim is supported, partly supported or not found, with its passage and quote, or a way to
 * find a source. Your own notes are never counted as evidence.
 */
export function CheckPanel({
  run,
  active,
  onActivate,
  onCheck,
  onCite,
  onFindSource,
  empty,
}: {
  run: CheckRun
  active: string | null
  onActivate: (id: string) => void
  onCheck: () => void
  onCite: (result: ClaimResult) => void
  onFindSource: (claim: string) => void
  /** The draft has no text yet. */
  empty: boolean
}) {
  const rows = [...run.results.values()]
  // Claims cited from this check (a new check starts over).
  const [cited, setCited] = useState<Set<string>>(new Set())
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when a new check starts
  useEffect(() => {
    if (run.running) setCited(new Set())
  }, [run.running])
  const activeRef = useRef<HTMLLIElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: follow the active card
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [active])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-4">
        <Button onClick={onCheck} disabled={run.running || empty} className="w-full">
          <ListChecksIcon strokeWidth={1.75} />
          {run.running ? "Checking…" : rows.length ? "Check again" : "Check my draft"}
        </Button>
        <p className="mt-2 text-meta text-ash-gray">
          {run.counts
            ? [
                `${run.counts.supported} supported`,
                `${run.counts.partly} partly`,
                run.counts.contradicted ? `${run.counts.contradicted} contradicted` : null,
                `${run.counts["not-found"]} not found`,
                run.ms ? `${(run.ms / 1000).toFixed(1)} s` : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : "Every claim is looked for in your sources (not your notes), and each quote is checked in Zetaris."}
        </p>
        {run.error && <p className="mt-2 text-meta text-contradicts">{run.error}</p>}
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
        {!rows.length && !run.running && (
          <li className="p-4 text-snippet text-ash-gray">
            {empty ? "No claims to check yet. Write a few sentences first." : "Not checked yet."}
          </li>
        )}
        {rows.map((r) => {
          const v = VERDICT[r.verdict] ?? VERDICT["not-found"]
          const open = r.id === active
          const result = r.verdict !== "checking" ? (r as ClaimResult) : null
          return (
            <li key={r.id} ref={open ? activeRef : undefined}>
              <button
                type="button"
                onClick={() => onActivate(r.id)}
                aria-expanded={open}
                className={cn(
                  "block w-full px-4 py-3 text-left transition-colors duration-(--duration-press) hover:bg-white/4",
                  open && "bg-white/5",
                )}
              >
                <span className={cn("inline-flex items-center gap-1.5 text-meta", v.className)}>
                  <Glyph verdict={r.verdict} />
                  {v.word}
                </span>
                <span
                  className={cn(
                    "mt-1 block text-snippet text-silver-mist",
                    !open && "line-clamp-2",
                  )}
                >
                  {r.sentence}
                </span>
              </button>
              {open && result && (
                <div className="px-4 pb-4">
                  <p className="text-meta text-ash-gray">{result.why}</p>
                  {result.passage && result.quote && (
                    <>
                      <blockquote className="mt-2.5 border-l-2 border-partly/70 pl-3 text-snippet leading-relaxed text-silver-mist">
                        “{result.quote}”
                      </blockquote>
                      <p className="mt-1.5 text-meta text-ash-gray">
                        {result.passage.title}
                        {result.passage.page ? ` · p. ${result.passage.page}` : ""}
                        {result.verified ? " · found in Zetaris" : ""}
                      </p>
                    </>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {result.verdict !== "contradicted" &&
                    result.passage &&
                    result.quote &&
                    result.verified !== false ? (
                      <>
                        <Button
                          size="sm"
                          variant={cited.has(result.id) ? "ghost" : "secondary"}
                          disabled={cited.has(result.id)}
                          onClick={() => {
                            onCite(result)
                            setCited((c) => new Set(c).add(result.id))
                          }}
                        >
                          {cited.has(result.id) ? (
                            <CheckIcon className="text-supports" />
                          ) : (
                            <PlusIcon strokeWidth={1.75} />
                          )}
                          {cited.has(result.id) ? "Cited" : "Cite this"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-ash-gray hover:text-bone-white"
                          onClick={() =>
                            result.passage &&
                            openSource({
                              fileId: result.passage.fileId,
                              title: result.passage.title,
                              kind: result.passage.kind as FileKind,
                              passageId: result.passage.passageId,
                              quote: result.quote,
                            })
                          }
                        >
                          Open
                          <ArrowUpRightIcon strokeWidth={1.75} />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => onFindSource(result.claim)}
                        >
                          <SearchIcon strokeWidth={1.5} />
                          Find a source
                        </Button>
                        {result.verdict === "contradicted" && result.passage && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-ash-gray hover:text-bone-white"
                            onClick={() =>
                              result.passage &&
                              openSource({
                                fileId: result.passage.fileId,
                                title: result.passage.title,
                                kind: result.passage.kind as FileKind,
                                passageId: result.passage.passageId,
                                quote: result.quote,
                              })
                            }
                          >
                            Open what it says
                            <ArrowUpRightIcon strokeWidth={1.75} />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

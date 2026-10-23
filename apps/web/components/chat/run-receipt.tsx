"use client"

import type { Citation, Receipt, SourceRef, StepData } from "@konkyo/agents"
import { Button } from "@konkyo/ui/components/button"
import { Spinner } from "@konkyo/ui/components/spinner"
import { ToggleGroup, ToggleGroupItem } from "@konkyo/ui/components/toggle-group"
import { cn } from "@konkyo/ui/lib/utils"
import { CheckIcon, ChevronDownIcon, CopyIcon, DatabaseIcon, XIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { openSource } from "@/lib/preview"
import { whereIs } from "./citation-chip"

const seconds = (ms: number) => `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`

/** The live agent steps (plan F15): what the run is doing right now. */
export function LiveSteps({ steps }: { steps: StepData[] }) {
  return (
    <ol className="space-y-1.5" aria-live="polite" aria-label="What Konkyo is doing">
      {steps.map((step) => (
        <li key={step.id} className="flex items-start gap-2 text-snippet">
          <span className="mt-0.5 grid size-3.5 shrink-0 place-items-center">
            {step.state === "running" ? (
              <Spinner className="size-3 text-ash-gray" />
            ) : step.state === "done" ? (
              <CheckIcon className="size-3.5 text-supports" strokeWidth={2.25} />
            ) : (
              <XIcon className="size-3.5 text-contradicts" strokeWidth={2.25} />
            )}
          </span>
          <span className={cn(step.state === "running" ? "text-silver-mist" : "text-ash-gray")}>
            {step.label}
            {step.detail && step.id !== "plan" && (
              <span className="ml-1.5 text-ash-gray/80">· {step.detail}</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  )
}

/**
 * The Grounds receipt (plan §7.4 #3): the run's steps collapse into one grey line saying what
 * was checked; opened, it shows the steps, every source used, and the Zetaris statement that
 * checked the quotes (Show SQL). This is where the grounds (根拠) behind an answer are seen.
 */
export function RunReceipt({
  receipt,
  steps,
  citations,
  sources,
}: {
  receipt: Receipt
  steps: StepData[]
  citations: Citation[]
  sources: SourceRef[]
}) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<"steps" | "sources">("steps")
  const [sql, setSql] = useState(false)
  const line = [
    `Checked ${receipt.quotes} quote${receipt.quotes === 1 ? "" : "s"} against ${receipt.sources} source${receipt.sources === 1 ? "" : "s"} in Zetaris`,
    receipt.rewritten ? `${receipt.rewritten} rewritten` : null,
    receipt.dropped ? `${receipt.dropped} dropped` : null,
    seconds(receipt.totalMs),
  ]
    .filter(Boolean)
    .join(" · ")
  const used = new Set(citations.map((c) => c.passageId))

  return (
    <div className="mt-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 text-snippet text-ash-gray transition-colors duration-(--duration-press) hover:text-silver-mist"
      >
        <CheckIcon className="size-3.5 text-supports" strokeWidth={2.25} aria-hidden />
        {line}
        <ChevronDownIcon
          className={cn(
            "size-3.5 transition-transform duration-(--duration-menu)",
            open && "rotate-180",
          )}
          strokeWidth={1.75}
          aria-hidden
        />
      </button>
      {open && (
        <div className="mt-3 animate-in rounded-xl border border-border bg-panel p-4 duration-(--duration-menu) fade-in-0">
          <ToggleGroup
            value={[tab]}
            onValueChange={(v: string[]) => setTab((v[0] as "steps" | "sources") ?? "steps")}
            aria-label="Show"
          >
            <ToggleGroupItem value="steps" className="h-7 rounded-full px-3 text-snippet">
              Steps
            </ToggleGroupItem>
            <ToggleGroupItem value="sources" className="h-7 rounded-full px-3 text-snippet">
              Sources · {new Set(sources.map((s) => s.fileId)).size}
            </ToggleGroupItem>
          </ToggleGroup>

          {tab === "steps" ? (
            <div className="mt-4">
              <LiveSteps steps={steps} />
              <p className="mt-3 text-meta text-ash-gray">
                Planner {receipt.models.planner} · Writer {receipt.models.writer} · Verifier{" "}
                {receipt.models.verifier}
                {receipt.rounds
                  ? ` · ${receipt.rounds} rewrite round${receipt.rounds === 1 ? "" : "s"}`
                  : ""}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-3 -ml-2.5 h-7 px-2.5 text-snippet text-ash-gray hover:text-bone-white"
                onClick={() => setSql((s) => !s)}
                aria-expanded={sql}
              >
                <DatabaseIcon strokeWidth={1.5} />
                {sql ? "Hide SQL" : "Show SQL"}
              </Button>
              {sql && (
                <div className="relative mt-2">
                  <pre className="max-h-72 overflow-auto rounded-lg bg-black p-3 font-mono text-[12px] leading-relaxed text-silver-mist">
                    {receipt.sql || "-- No quotes needed checking."}
                  </pre>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Copy SQL"
                    className="absolute top-2 right-2 text-ash-gray hover:text-bone-white"
                    onClick={() => {
                      void navigator.clipboard.writeText(receipt.sql)
                      toast.success("SQL copied")
                    }}
                  >
                    <CopyIcon strokeWidth={1.5} />
                  </Button>
                  <p className="mt-1.5 text-meta text-ash-gray">
                    One statement checked every quote against Zetaris's own reading of each
                    document.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {sources.map((s) => (
                <li key={s.passageId}>
                  <button
                    type="button"
                    onClick={() =>
                      openSource({
                        fileId: s.fileId,
                        title: s.title,
                        kind: s.kind as Parameters<typeof openSource>[0]["kind"],
                        passageId: s.passageId,
                      })
                    }
                    className="flex w-full items-start gap-3 py-2.5 text-left"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-1.5 size-1.5 shrink-0 rounded-full",
                        used.has(s.passageId) ? "bg-supports" : "bg-white/20",
                      )}
                    />
                    <span className="sr-only">
                      {used.has(s.passageId) ? "Cited:" : "Read, not cited:"}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-snippet text-silver-mist">
                        {s.title}
                        <span className="text-ash-gray"> · {whereIs(s)}</span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 text-meta text-ash-gray">{s.text}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

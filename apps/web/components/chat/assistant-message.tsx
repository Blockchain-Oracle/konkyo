"use client"

import type { KonkyoMessage } from "@konkyo/agents"
import { parseAnswer } from "@konkyo/agents/citations"
import { Button } from "@konkyo/ui/components/button"
import { LinkIcon, RotateCcwIcon, SearchXIcon, TelescopeIcon, UploadIcon } from "lucide-react"
import { useEffect, useRef } from "react"
import { useUploads } from "@/components/library/uploads-provider"
import { openImport } from "@/components/shell/app-dialogs"
import { partsOf } from "@/lib/message-parts"
import { useSpokenHighlight } from "@/lib/read-aloud"
import { sound } from "@/lib/sounds"
import { AgreeMatrix } from "./agree-matrix"
import { AnswerText } from "./answer-text"
import { CitedIn } from "./citation-chip"
import { DeepRun } from "./deep-run"
import { MessageActions } from "./message-actions"
import { LiveSteps, RunReceipt } from "./run-receipt"
import { ScoutAnswer } from "./scout-answer"

/**
 * An answer: live steps and the streaming draft while the run works, then the
 * verified answer with its citations, caveat and receipt. A question the library can't answer
 * says so plainly (F14), with ways to add what is missing; nothing is invented.
 */
export function AssistantMessage({
  message,
  running,
  onRegenerate,
  onFindSources,
  onDeepSettled,
  onDeepRetry,
  question,
}: {
  message: KonkyoMessage
  /** The question this answers (Save to note uses it as the heading). */
  question?: string
  running: boolean
  /** Only on the latest answer, once it has finished. */
  onRegenerate?: () => void
  /** "Not in your library" → deep search (F14); only on the latest answer. */
  onFindSources?: () => void
  onDeepSettled?: (runId: string) => void
  onDeepRetry?: (question: string) => void
}) {
  const { steps, draft, sources, final, receipt, notFound, matrix } = partsOf(message)
  const { pickFiles } = useUploads()
  // read aloud (▶ listen in its actions): the sentence being said is underlined in place
  const said = useRef<HTMLDivElement>(null)
  useSpokenHighlight(said, message.id)
  // The receipt lands with its sound, once, while you watch it arrive.
  const announced = useRef(false)
  useEffect(() => {
    if (receipt && running && !announced.current) {
      announced.current = true
      sound("check")
    }
  }, [receipt, running])

  if (message.parts.some((p) => p.type === "data-deep")) {
    return (
      <DeepRun
        message={message}
        onSettled={onDeepSettled}
        onRetry={onDeepRetry}
        answerView={(answer, live) => (
          <AssistantMessage
            message={{ ...answer, parts: answer.parts.filter((p) => p.type !== "data-deep") }}
            running={live}
            question={question}
          />
        )}
      />
    )
  }

  if (notFound) {
    return (
      <div className="rounded-card border border-border bg-panel p-5">
        <div className="flex items-start gap-3">
          <SearchXIcon
            className="mt-0.5 size-4.5 shrink-0 text-not-found"
            strokeWidth={1.5}
            aria-hidden
          />
          <div>
            <p className="text-ui text-bone-white">This isn't in your library yet.</p>
            <p className="mt-1 text-snippet text-ash-gray">
              Nothing you've added answers “{notFound.question}”. Konkyo answers only from your
              files, so it won't guess.{" "}
              {onFindSources
                ? "Find sources searches open papers and the web, imports what you choose, and answers from it."
                : "Add a source and ask again."}
            </p>
            {notFound.tried && notFound.tried.length > 0 && (
              <div className="mt-3">
                <p className="text-snippet text-ash-gray">Searched your library for</p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {notFound.tried.map((query) => (
                    <li
                      key={query}
                      className="rounded-full border border-border px-2.5 py-0.5 text-snippet text-silver-mist"
                    >
                      {query}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {onFindSources && (
                <Button size="sm" onClick={onFindSources}>
                  <TelescopeIcon strokeWidth={1.5} />
                  Find sources
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => pickFiles()}>
                <UploadIcon strokeWidth={1.5} />
                Upload files
              </Button>
              <Button variant="ghost" size="sm" onClick={() => openImport()}>
                <LinkIcon strokeWidth={1.5} />
                Import by URL or DOI
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (final) {
    return (
      <div ref={said}>
        <CitedIn.Provider value={message.id}>
          <AnswerText body={final.body} citations={final.citations} rewritten={final.rewritten} />
        </CitedIn.Provider>
        {final.caveat && (
          <p className="mt-4 border-l-2 border-white/14 pl-3 text-snippet text-ash-gray">
            {final.caveat}
          </p>
        )}
        {matrix && <AgreeMatrix matrix={matrix} />}
        {receipt && (
          <RunReceipt
            receipt={receipt}
            steps={steps}
            citations={final.citations}
            sources={sources}
          />
        )}
        {!running && (
          <MessageActions
            message={message}
            body={final.body}
            caveat={final.caveat}
            citations={final.citations}
            onRegenerate={onRegenerate}
            question={question}
          />
        )}
      </div>
    )
  }

  const body = draft ? parseAnswer(draft).body : ""
  // Saved before it finished (stopped, or the run failed): its steps stop where it ended, and
  // the unverified draft is never shown as an answer.
  if (!running) {
    const ended = steps.map((step) =>
      step.state === "running" ? { ...step, state: "failed" as const } : step,
    )
    return (
      <div>
        {ended.length > 0 && <LiveSteps steps={ended} />}
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-panel px-4 py-3">
          <p className="flex-1 text-snippet text-silver-mist">
            This answer didn't finish, so nothing in it was verified.
          </p>
          {onRegenerate && (
            <Button variant="secondary" size="sm" onClick={onRegenerate}>
              <RotateCcwIcon strokeWidth={1.75} />
              Try again
            </Button>
          )}
        </div>
      </div>
    )
  }
  return (
    <div>
      {/* The wait, as the scout: planning, reading the passages, then checking each quote. */}
      <ScoutAnswer steps={steps} sources={sources} matrix={matrix} />
      {steps.length > 0 && <LiveSteps steps={steps} />}
      {body && (
        <div className="mt-5">
          <AnswerText body={body} streaming={!steps.some((s) => s.id === "verify")} />
        </div>
      )}
      {matrix && <AgreeMatrix matrix={matrix} />}
    </div>
  )
}

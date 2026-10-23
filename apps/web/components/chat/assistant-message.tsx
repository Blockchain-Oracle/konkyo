"use client"

import type { KonkyoMessage, StepData } from "@konkyo/agents"
import { parseAnswer } from "@konkyo/agents/citations"
import { Button } from "@konkyo/ui/components/button"
import { LinkIcon, RotateCcwIcon, SearchXIcon, UploadIcon } from "lucide-react"
import { useUploads } from "@/components/library/uploads-provider"
import { openImport } from "@/components/shell/app-dialogs"
import { AgreeMatrix } from "./agree-matrix"
import { AnswerText } from "./answer-text"
import { MessageActions } from "./message-actions"
import { LiveSteps, RunReceipt } from "./run-receipt"

/** The parts of an answer message, latest state of each (data parts update in place). */
function partsOf(message: KonkyoMessage) {
  const steps = new Map<string, StepData>()
  let draft = ""
  let sources: Extract<
    KonkyoMessage["parts"][number],
    { type: "data-sources" }
  >["data"]["sources"] = []
  let final: Extract<KonkyoMessage["parts"][number], { type: "data-final" }>["data"] | undefined
  let receipt: Extract<KonkyoMessage["parts"][number], { type: "data-receipt" }>["data"] | undefined
  let notFound: { question: string } | undefined
  let matrix: Extract<KonkyoMessage["parts"][number], { type: "data-matrix" }>["data"] | undefined
  for (const part of message.parts) {
    if (part.type === "data-step") steps.set(part.data.id, part.data)
    else if (part.type === "text") draft = part.text
    else if (part.type === "data-sources") sources = part.data.sources
    else if (part.type === "data-final") final = part.data
    else if (part.type === "data-receipt") receipt = part.data
    else if (part.type === "data-notFound") notFound = part.data
    else if (part.type === "data-matrix") matrix = part.data
  }
  return { steps: [...steps.values()], draft, sources, final, receipt, notFound, matrix }
}

/**
 * An answer (plan F11–F15): live steps and the streaming draft while the run works, then the
 * verified answer with its citations, caveat and receipt. A question the library can't answer
 * says so plainly (F14), with ways to add what is missing; nothing is invented.
 */
export function AssistantMessage({
  message,
  running,
  onRegenerate,
}: {
  message: KonkyoMessage
  running: boolean
  /** Only on the latest answer, once it has finished. */
  onRegenerate?: () => void
}) {
  const { steps, draft, sources, final, receipt, notFound, matrix } = partsOf(message)
  const { pickFiles } = useUploads()

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
              files, so it won't guess. Add a source and ask again.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
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
      <div>
        <AnswerText body={final.body} citations={final.citations} rewritten={final.rewritten} />
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

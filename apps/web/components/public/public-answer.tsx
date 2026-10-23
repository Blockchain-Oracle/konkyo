"use client"

import type { KonkyoMessage } from "@konkyo/agents"
import { parseAnswer } from "@konkyo/agents/citations"
import { SearchXIcon } from "lucide-react"
import { AgreeMatrix } from "@/components/chat/agree-matrix"
import { AnswerText } from "@/components/chat/answer-text"
import { LiveSteps, RunReceipt } from "@/components/chat/run-receipt"
import { partsOf } from "@/lib/message-parts"

/**
 * An answer on a public folder's page (plan F36): the same live steps, verified citations,
 * agree/disagree matrix and Grounds receipt as the owner's, without the owner's actions (save,
 * rate, regenerate). Citations open the passage in this page's source pane.
 */
export function PublicAnswer({ message, running }: { message: KonkyoMessage; running: boolean }) {
  const { steps, draft, sources, final, receipt, notFound, matrix } = partsOf(message)

  if (notFound)
    return (
      <div className="flex items-start gap-3 rounded-card border border-border bg-panel p-5">
        <SearchXIcon
          className="mt-0.5 size-4.5 shrink-0 text-not-found"
          strokeWidth={1.5}
          aria-hidden
        />
        <div>
          <p className="text-ui text-bone-white">These sources don't cover that.</p>
          <p className="mt-1 text-snippet text-ash-gray">
            Answers here come only from this folder's files, so nothing is guessed. Try asking about
            what one of them discusses.
          </p>
        </div>
      </div>
    )

  if (final)
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
      </div>
    )

  const body = draft ? parseAnswer(draft).body : ""
  if (!running) {
    const ended = steps.map((step) =>
      step.state === "running" ? { ...step, state: "failed" as const } : step,
    )
    return (
      <div>
        {ended.length > 0 && <LiveSteps steps={ended} />}
        <p className="mt-4 rounded-xl border border-border bg-panel px-4 py-3 text-snippet text-silver-mist">
          This answer didn't finish, so nothing in it was verified. Ask again.
        </p>
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

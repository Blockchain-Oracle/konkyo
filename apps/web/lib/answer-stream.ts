import "server-only"
import type { AnswerEvent, KonkyoMessage } from "@konkyo/agents"
import type { UIMessageStreamWriter } from "ai"

/**
 * Writes the answer pipeline's events into a chat stream (plan F11–F15): one part per step,
 * rewritten in place; the draft as text; then the verified answer, the matrix and the receipt.
 * Shared by the signed-in chat and a public folder's chat.
 */
export function answerWriter(writer: UIMessageStreamWriter<KonkyoMessage>) {
  let drafting = false
  let receipt: unknown
  const endDraft = () => {
    if (drafting) writer.write({ type: "text-end", id: "draft" })
    drafting = false
  }
  const emit = (event: AnswerEvent) => {
    switch (event.type) {
      case "step":
        writer.write({ type: "data-step", id: `step-${event.id}`, data: event })
        break
      case "sources":
        writer.write({ type: "data-sources", id: "sources", data: { sources: event.sources } })
        break
      case "text":
        if (!drafting) {
          writer.write({ type: "text-start", id: "draft" })
          drafting = true
        }
        writer.write({ type: "text-delta", id: "draft", delta: event.delta })
        break
      case "revising":
        writer.write({ type: "data-revising", id: "revising", data: event })
        break
      case "final":
        endDraft()
        writer.write({
          type: "data-final",
          id: "final",
          data: {
            body: event.body,
            caveat: event.caveat,
            citations: event.citations,
            rewritten: event.rewritten,
          },
        })
        break
      case "not-found":
        endDraft()
        writer.write({ type: "data-notFound", id: "not-found", data: { question: event.question } })
        break
      case "matrix":
        writer.write({ type: "data-matrix", id: "matrix", data: event.matrix })
        break
      case "receipt":
        receipt = event.receipt
        writer.write({ type: "data-receipt", id: "receipt", data: event.receipt })
        break
    }
  }
  return { emit, endDraft, receipt: () => receipt }
}

import "server-only"
import type { AnswerEvent, KonkyoMessage, Receipt } from "@konkyo/agents"
import type { UIMessageStreamWriter } from "ai"

/**
 * Writes the answer pipeline's events into a chat stream: one part per step,
 * rewritten in place; the draft as text; then the verified answer, the matrix and the receipt.
 * Shared by the signed-in chat and a public folder's chat.
 */
export function answerWriter(writer: UIMessageStreamWriter<KonkyoMessage>) {
  let drafting = false
  // Each restart of the Writer gets a new text part; the latest one is the draft shown.
  let draftId = "draft"
  let restarts = 0
  let receipt: Receipt | undefined
  const endDraft = () => {
    if (drafting) writer.write({ type: "text-end", id: draftId })
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
          writer.write({ type: "text-start", id: draftId })
          drafting = true
        }
        writer.write({ type: "text-delta", id: draftId, delta: event.delta })
        break
      case "draft-restart":
        endDraft()
        restarts++
        draftId = `draft-${restarts}`
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
        writer.write({
          type: "data-notFound",
          id: "not-found",
          data: { question: event.question, tried: event.tried },
        })
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

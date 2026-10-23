import type { KonkyoMessage, StepData } from "@konkyo/agents"

/** The parts of an answer message, latest state of each (data parts update in place). */
export function partsOf(message: KonkyoMessage) {
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

/**
 * The landing's board and its live demo are separate islands; a question picked on the board is
 * handed to the demo through one window event, and the page scrolls to it.
 */
export const ASK_EVENT = "konkyo:landing-ask"

export function askOnLanding(question: string) {
  window.dispatchEvent(new CustomEvent<string>(ASK_EVENT, { detail: question }))
  document.getElementById("ask")?.scrollIntoView({ behavior: "smooth", block: "start" })
}

/**
 * The landing's board and its live demo are separate islands; a question picked on the board is
 * handed to the demo through one window event, and the page scrolls to it.
 */
export const ASK_EVENT = "konkyo:landing-ask"

export function askOnLanding(question: string) {
  window.dispatchEvent(new CustomEvent<string>(ASK_EVENT, { detail: question }))
  document.getElementById("ask")?.scrollIntoView({ behavior: "smooth", block: "start" })
}

/** The board's citation: the demo opens that paper at the cited words in its source sheet. */
export const CITE_EVENT = "konkyo:landing-cite"

export type LandingCite = {
  /** The start of the paper's title in the demo space. */
  title: string
  page: number
  quote: string
}

export function citeOnLanding(cite: LandingCite) {
  window.dispatchEvent(new CustomEvent<LandingCite>(CITE_EVENT, { detail: cite }))
}

/** A citation record in CSL-JSON, the format citation processors read (plan F06, F26). */
export type CslName = { family?: string; given?: string; literal?: string }
export type CslItem = {
  type: string
  title?: string
  author?: CslName[]
  issued?: { "date-parts": number[][] }
  "container-title"?: string
  publisher?: string
  volume?: string
  issue?: string
  page?: string
  DOI?: string
  URL?: string
  abstract?: string
}

/** What Konkyo keeps about a file besides its text (stored in `files.meta`). */
export type FileMeta = {
  csl?: CslItem
  /** Two or three sentences written by a model from the file itself. */
  summary?: string
  openalex?: { id: string; citedBy: number }
  /** How the record was found; "you" once the person edits it. */
  foundBy?: "doi" | "arxiv" | "title" | "you"
  /**
   * Openly licensed material Konkyo brought in (the starter packs, F39): the licence and the
   * attribution its publisher asks for, shown on the file and printed on each page of its copy.
   */
  licence?: { name: string; url: string; attribution: string }
  /** The image a web page chose for itself (og:image): its polaroid on a space's wall. */
  ogImage?: string
}

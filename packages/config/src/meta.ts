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
}

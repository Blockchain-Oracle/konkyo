// The live examples on the made-with pages (plan F61), shared by the page and its API routes.
/**
 * The Zetaris page's live example: one sentence from a sample paper as written, and two
 * versions a careless writer might produce. Pressing check sends all three to Zetaris in one
 * statement, exactly as the Verifier does with an answer's quotes.
 */
export const ZETARIS_EXAMPLE = {
  /** The demo space's paper, by the start of its title (ids differ between servers). */
  paper: "Daytime Naps, Motor Memory Consolidation",
  byline: "Nishida and Walker, 2007",
  quotes: [
    {
      id: "written",
      label: "as written",
      text: "subjects in the nap group demonstrated a highly significant 16% consolidation enhancement",
    },
    {
      id: "number",
      label: "one number changed",
      text: "subjects in the nap group demonstrated a highly significant 61% consolidation enhancement",
    },
    {
      id: "word",
      label: "one word added",
      text: "subjects in the no-nap group demonstrated a highly significant 16% consolidation enhancement",
    },
  ],
} as const

/** The OpenAlex page's live example: topics near the sample papers, searched as deep search does. */
export const OPENALEX_TOPICS = [
  "sleep spindles memory consolidation",
  "caffeine sleep quality",
  "daytime nap motor learning",
] as const

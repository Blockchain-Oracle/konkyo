/** Short, factual slide copy. This is the one place to revise the pitch wording. */
export const PITCH = [
  {
    id: "demo",
    theme: "dark",
    label: "START HERE",
    eyebrow: "KONKYO · THE PITCH",
    title: "See the product first.",
    body: "Start with the live three-paper question. The filmed walkthrough is still being recorded.",
  },
  {
    id: "problem",
    theme: "light",
    label: "THE PROBLEM",
    eyebrow: "THE PROBLEM",
    title: "A citation should lead to the passage.",
    body: "If you cannot find the quoted words, you are left checking an answer by hand.",
  },
  {
    id: "product",
    theme: "dark",
    label: "KONKYO",
    eyebrow: "THE PRODUCT",
    title: "Every answer shows its grounds.",
    body: "Konkyo answers from your library, checks each quote against its source, and shows the passage and the receipt.",
  },
  {
    id: "milestones",
    theme: "light",
    label: "WHAT'S NEXT",
    eyebrow: "AFTER THE HACKATHON",
    title: "We keep shipping.",
    body: "This is a working starting point, not the end of the project. The next steps follow real questions from researchers.",
  },
] as const

export const MILESTONES = [
  {
    label: "NOW · LIVE",
    text: "Ask across three real papers and inspect the checked quotes.",
  },
  {
    label: "NEXT · IN PROGRESS",
    text: "Publish the filmed walkthrough and gather researcher feedback.",
  },
  {
    label: "ONGOING · DIRECTION",
    text: "Improve source handling, answer checks, and the path from claim to passage.",
  },
] as const

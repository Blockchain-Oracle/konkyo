import type { FileMeta } from "./meta"

type Licence = NonNullable<FileMeta["licence"]>

/*
 * The starter packs: real, openly licensed material, each licence read on its own
 * source page on 2026.
 * - OpenStax Psychology 2e is CC BY-NC-SA 4.0 (not CC BY, as first planned). For digital reuse
 *   OpenStax asks for "Access for free at <book URL>" on every page, and it is printed on each.
 * - MIT OCW 9.00SC (Fall 2011, Prof. John Gabrieli) is CC BY-NC-SA 4.0. The lecture comes in as its
 *   transcript and slides (PDFs): YouTube refuses server downloads, and transcribing an hour of
 *   audio for every new person would spend the ElevenLabs plan.
 * - The papers' licences are stated on their publishers' pages (PLOS, Frontiers, Nature).
 * Konkyo is free, so the non-commercial licences hold.
 */
const OPENSTAX: Licence = {
  name: "CC BY-NC-SA 4.0",
  url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
  attribution:
    "Spielman, Jenkins & Lovett, Psychology 2e, OpenStax (2020). Access for free at https://openstax.org/books/psychology-2e/pages/1-introduction",
}
const OCW: Licence = {
  name: "CC BY-NC-SA 4.0",
  url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
  attribution:
    "John Gabrieli, 9.00SC Introduction to Psychology, Fall 2011, MIT OpenCourseWare, https://ocw.mit.edu",
}
const paper = (name: string, url: string, attribution: string): Licence => ({
  name,
  url,
  attribution,
})

const OCW_FILES = "https://ocw.mit.edu/courses/9-00sc-introduction-to-psychology-fall-2011"

export const STARTERS = {
  study: {
    folder: "Sample course: Memory",
    files: [
      {
        url: "https://openstax.org/books/psychology-2e/pages/8-1-how-memory-functions",
        title: "8.1 How Memory Functions",
        licence: OPENSTAX,
      },
      {
        url: "https://openstax.org/books/psychology-2e/pages/8-2-parts-of-the-brain-involved-with-memory",
        title: "8.2 Parts of the Brain Involved with Memory",
        licence: OPENSTAX,
      },
      {
        url: "https://openstax.org/books/psychology-2e/pages/8-3-problems-with-memory",
        title: "8.3 Problems with Memory",
        licence: OPENSTAX,
      },
      {
        url: `${OCW_FILES}/70cf036a23528edafdc89c66b91ee198_MIT9_00SCF11_lec10_mem1.pdf`,
        title: "Lecture 10: Memory I (slides)",
        licence: OCW,
      },
      {
        url: `${OCW_FILES}/32742a76ab09aedcab3d38d4971c6fbc_76O3rulk844.pdf`,
        title: "Lecture 10: Memory I (transcript)",
        licence: OCW,
      },
    ],
  },
  research: {
    question: "Does sleep help consolidate memories, and what happens during sleep that does it?",
  },
  write: {
    folder: "Essay starter: Sleep and learning",
    files: [
      {
        url: "https://doi.org/10.1371/journal.pone.0000341",
        licence: paper(
          "CC BY",
          "https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0000341",
          "Nishida & Walker (2007), PLOS ONE. Creative Commons Attribution License",
        ),
      },
      {
        url: "https://doi.org/10.3389/fnsys.2014.00046",
        licence: paper(
          "CC BY 3.0",
          "https://creativecommons.org/licenses/by/3.0/",
          "Sleep for cognitive enhancement (2014), Frontiers in Systems Neuroscience",
        ),
      },
      {
        url: "https://doi.org/10.1038/s41598-018-36557-z",
        licence: paper(
          "CC BY 4.0",
          "https://creativecommons.org/licenses/by/4.0/",
          "Muehlroth et al. (2019), Scientific Reports",
        ),
      },
    ],
    note: {
      title: "Does sleep make you learn better?",
      intro:
        "An essay starter. The three papers beside this note are your sources. Write under each heading; select a claim you've written and choose Find a source to cite the passage that supports it, and run Check my draft to see which claims your sources back.",
      sections: [
        ["Question", "Does sleep after learning help you remember, and is a nap enough?"],
        ["Introduction", "What memory consolidation is, and why it matters to anyone who studies."],
        ["Evidence", "What these studies found about sleep, naps and memory."],
        ["Limits", "Where the evidence is thin, or the studies disagree."],
        ["Conclusion", "Your answer, in a sentence or two."],
      ],
    },
  },
} as const

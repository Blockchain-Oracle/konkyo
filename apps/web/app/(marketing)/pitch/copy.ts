/**
 * The pitch, in plain words. This is the one place to revise it. Each slide has a short title, a
 * sentence or two, and one picture or list on the right.
 */

export type Card = { label: string; text: string }
export type Picture = { src: string; alt: string; width: number; height: number; caption: string }
export type Link = { href: string; text: string; external?: boolean }

export type Visual =
  /** A screenshot, tilted a little like a photo on a wall. */
  | { kind: "capture"; picture: Picture }
  /** A screenshot, straight. */
  | { kind: "picture"; picture: Picture }
  /** A list of short cards. */
  | { kind: "cards"; items: readonly Card[]; columns?: 1 | 2; dense?: boolean }
  /** Several screenshots in a grid. */
  | { kind: "shots"; pictures: readonly Picture[] }

export type Slide = {
  id: string
  theme: "dark" | "light"
  /** Small label in the header, next to the slide number. */
  label: string
  eyebrow: string
  title: string
  body: string
  /** A wide picture goes under the words instead of beside them. */
  layout?: "wide"
  visual: Visual
  links?: readonly Link[]
}

export const PITCH: readonly Slide[] = [
  {
    id: "start",
    theme: "dark",
    label: "START HERE",
    eyebrow: "KONKYO · THE PITCH",
    title: "See it first.",
    body: "Konkyo is one library for everything you study. Ask it a question and every answer shows where it came from. Try three real papers right now. You don't need an account.",
    visual: {
      kind: "capture",
      picture: {
        src: "/demo/landing-capture.jpg",
        alt: "Konkyo's front page with a sample paper and its cited answer",
        width: 1280,
        height: 720,
        caption: "The live product at konkyo.xyz",
      },
    },
    links: [
      { href: "/#ask", text: "try three real papers" },
      { href: "/demo", text: "watch the demo video" },
    ],
  },
  {
    id: "problem",
    theme: "light",
    label: "THE PROBLEM",
    eyebrow: "THE PROBLEM",
    title: "Checking is still your job.",
    body: "When you study or write, you read lots of sources, so you ask an AI to pull them together. It sounds sure. But a little number can point to a page that says something else. In July 2025, NTU Singapore gave an essay zero for 14 false citations or data.",
    visual: {
      kind: "cards",
      items: [
        { label: "01 / ASK", text: "You upload your files and ask a question." },
        { label: "02 / READ", text: "You get a smooth answer with little numbers." },
        { label: "03 / HUNT", text: "You open each source to find the line behind each sentence." },
        {
          label: "04 / COMPARE",
          text: "You read the sources side by side to see where they disagree.",
        },
      ],
    },
  },
  {
    id: "users",
    theme: "dark",
    label: "WHO IT'S FOR",
    eyebrow: "THE PEOPLE",
    title: "For people who read a lot.",
    body: "Anyone who reads many sources and has to cite them. They need to trust an answer, or know exactly where it fails.",
    visual: {
      kind: "cards",
      columns: 2,
      items: [
        { label: "STUDENTS", text: "Exam revision from lectures and slides." },
        { label: "ESSAY WRITERS", text: "Your sources, your draft, and a check on every claim." },
        { label: "RESEARCHERS", text: "See where papers agree and where they disagree." },
        { label: "READING GROUPS", text: "The week's papers in one shared space." },
        {
          label: "PROFESSIONALS",
          text: "Reports from Gmail, Drive and Notion, with every quote checked.",
        },
      ],
    },
  },
  {
    id: "solution",
    theme: "light",
    label: "THE SOLUTION",
    eyebrow: "THE SOLUTION",
    title: "Agents do the checking.",
    body: "Konkyo answers only from your own files. After the AI writes, a checker looks for each quote, word for word, in the original. A sentence it can't find is fixed or dropped. You click a tick and read the real passage.",
    visual: {
      kind: "picture",
      picture: {
        src: "/pitch/journey-answer.jpg",
        alt: "A Konkyo answer: each finding names its paper and has a ticked citation, with an agree and disagree table below",
        width: 1100,
        height: 1056,
        caption:
          "A real answer: every finding names its paper, and every tick means the quote was found",
      },
    },
    links: [{ href: "/#ask", text: "ask three real papers" }],
  },
  {
    id: "agents",
    theme: "dark",
    label: "HOW THE AGENTS WORK",
    eyebrow: "THE AGENT TEAM",
    title: "A team, each with a small job.",
    body: "One question goes through the whole team. Each agent hands its work to the next, and the receipt under the answer shows what each one did.",
    visual: {
      kind: "cards",
      columns: 2,
      dense: true,
      items: [
        { label: "01 / PLANNER", text: "Turns your question into one to three searches." },
        { label: "02 / RETRIEVER", text: "Searches your files by meaning and by words." },
        {
          label: "03 / WRITER",
          text: "Writes one finding per sentence, each with its exact quote.",
        },
        {
          label: "04 / VERIFIER",
          text: "Finds every quote in the original. Failures go back to the Writer.",
        },
        { label: "05 / ANALYST", text: "Lines the sources up: agree, disagree, or partly." },
        {
          label: "HELPERS",
          text: "Scout finds more papers. Tutor makes practice from your files.",
        },
      ],
    },
    links: [
      {
        href: "https://docs.konkyo.xyz/docs/agents/how-answers-are-checked",
        text: "how an answer is checked",
        external: true,
      },
    ],
  },
  {
    id: "architecture",
    theme: "light",
    label: "ARCHITECTURE",
    eyebrow: "HOW IT FITS TOGETHER",
    title: "One app, one server.",
    body: "A web app and a worker run on one server. Postgres keeps your library. Every file also goes to Zetaris. The AI models come from NVIDIA and OpenAI, and each job has a back-up.",
    layout: "wide",
    visual: {
      kind: "picture",
      picture: {
        src: "/pitch/system-light.png",
        alt: "Konkyo's system: the web app and worker on one server, with Postgres and pgvector, Zetaris, three Meterless engines, and NVIDIA Nemotron and OpenAI with a fallback for every agent role",
        width: 1568,
        height: 592,
        caption: "The system map",
      },
    },
    links: [
      { href: "https://docs.konkyo.xyz/docs/build", text: "the detailed map", external: true },
    ],
  },
  {
    id: "stack",
    theme: "light",
    label: "TECH STACK",
    eyebrow: "WHAT IT'S BUILT WITH",
    title: "Plain, solid tools.",
    body: "Everything is open source or an API we call. The code is in one public repository, and anyone can run it.",
    visual: {
      kind: "cards",
      columns: 2,
      dense: true,
      items: [
        { label: "THE APP", text: "TypeScript, Next.js 16, React 19, Better Auth." },
        {
          label: "THE DATA",
          text: "Postgres with pgvector for search by meaning, and pg-boss for background jobs.",
        },
        {
          label: "THE FILES",
          text: "S3-style storage, Gotenberg and OCRmyPDF to make every file readable.",
        },
        { label: "THE MODELS", text: "NVIDIA Nemotron and OpenAI, with a back-up for every job." },
        {
          label: "VOICE",
          text: "ElevenLabs for lecture transcripts, read-aloud and audio briefs.",
        },
        {
          label: "THE PROOF",
          text: "Zetaris checks quotes. Meterless gives memory. One Coolify server runs it all.",
        },
      ],
    },
  },
  {
    id: "zetaris",
    theme: "dark",
    label: "ZETARIS",
    eyebrow: "SPONSOR · ZETARIS",
    title: "Zetaris checks every quote.",
    body: "Every file you add is also read by Zetaris, in its own way. When the AI writes an answer, we ask Zetaris one question in SQL: are these exact words in the original? Nothing gets a tick until Zetaris says yes.",
    visual: {
      kind: "picture",
      picture: {
        src: "/pitch/journey-receipt.jpg",
        alt: "The receipt under an answer: 10 quotes checked against 3 sources in Zetaris in 19 seconds, with the SQL that checked them",
        width: 1000,
        height: 778,
        caption: "The receipt under every answer shows the check and the SQL",
      },
    },
    links: [{ href: "/made-with/zetaris", text: "watch a quote get checked" }],
  },
  {
    id: "meterless",
    theme: "light",
    label: "METERLESS",
    eyebrow: "SPONSOR · METERLESS",
    title: "Meterless gives it a memory.",
    body: "Three Meterless engines each do a real job inside a feature you can use today.",
    visual: {
      kind: "cards",
      items: [
        {
          label: "H-MEM · YOUR CORRECTIONS",
          text: "Remembers what you mark wrong, and reads it before every new answer.",
        },
        {
          label: "WORLD MODEL · WHO SAID WHAT",
          text: "Keeps a map of which source says what, with the passage it came from. It powers the agree and disagree table.",
        },
        {
          label: "MARKOVIAN · LONG SEARCHES",
          text: "Reads a long list of papers in small steps and carries only the shortlist, so deep search stays focused.",
        },
      ],
    },
    links: [{ href: "/made-with/meterless", text: "follow it into the code" }],
  },
  {
    id: "nvidia",
    theme: "dark",
    label: "NVIDIA",
    eyebrow: "SPONSOR · NVIDIA",
    title: "Where NVIDIA helps.",
    body: "NVIDIA's Nemotron models do real work in every answer, and they step in when OpenAI is busy.",
    visual: {
      kind: "cards",
      columns: 2,
      dense: true,
      items: [
        {
          label: "PLANS",
          text: "Nemotron 3 Ultra plans each answer and screens deep-search finds.",
        },
        {
          label: "FINDS",
          text: "Nemotron 3.5 Embed turns passages and questions into numbers, so search works by meaning.",
        },
        { label: "LISTENS", text: "Nemotron 3.5 Lightning understands spoken questions." },
        { label: "GUARDS", text: "Nemotron 3.5 Content Safety checks public pages and articles." },
        {
          label: "BACKS UP",
          text: "Nemotron takes over every OpenAI job when it is busy, and the receipt says so.",
        },
      ],
    },
    links: [{ href: "/made-with/nvidia", text: "where Nemotron runs" }],
  },
  {
    id: "visuals",
    theme: "light",
    label: "THE PRODUCT",
    eyebrow: "PRODUCT VISUALS",
    title: "See the product.",
    body: "The wait, the proof, practice and writing. All of it sits on the same check.",
    visual: {
      kind: "shots",
      pictures: [
        {
          src: "/pitch/scout-shortlist.jpg",
          alt: "A deep search in progress: the scout has picked 12 of 28 sources",
          width: 1286,
          height: 555,
          caption: "While it searches: the scout picks 12 of 28 sources (an example run)",
        },
        {
          src: "/pitch/journey-citation.jpg",
          alt: "A citation opens the paper at the page, with the quoted passage highlighted",
          width: 1400,
          height: 835,
          caption: "Click a tick: the paper opens at the passage",
        },
        {
          src: "/pitch/surface-practise.jpg",
          alt: "A practice question answered right, with the source slide open beside it",
          width: 1200,
          height: 750,
          caption: "Practice, with answer keys checked against the source",
        },
        {
          src: "/pitch/surface-write.jpg",
          alt: "An essay note where Check my draft marks each claim as supported or contradicted",
          width: 1200,
          height: 750,
          caption: "Write: Check my draft marks every claim",
        },
      ],
    },
  },
  {
    id: "next",
    theme: "dark",
    label: "WHAT'S NEXT",
    eyebrow: "AFTER THE HACKATHON",
    title: "What comes next.",
    body: "This is a working start, not the end. The next steps come from the limits we already know about.",
    visual: {
      kind: "cards",
      items: [
        { label: "NEXT", text: "Put Konkyo in front of researchers, and listen to what they say." },
        {
          label: "SOON",
          text: "Read scanned pages better. Handwriting and tricky tables can still be missed.",
        },
        {
          label: "SOON",
          text: "Answer faster for more people. NVIDIA's free tier allows about 40 requests a minute per model.",
        },
        {
          label: "LATER",
          text: "Bring in sources from more places than Gmail, Drive, Notion and open papers.",
        },
      ],
    },
  },
]

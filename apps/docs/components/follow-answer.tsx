import { APP_URL } from "@/lib/layout.shared"

type Partner = "zetaris" | "meterless" | "nvidia" | "openalex"

/** Each partner's colour, as on its made-with page; ink reads on all four (5:1 and up). */
const PARTNERS: Record<Partner, { name: string; color: string }> = {
  zetaris: { name: "Zetaris", color: "#13b8a6" },
  meterless: { name: "Meterless", color: "#e9369d" },
  nvidia: { name: "NVIDIA Nemotron", color: "#b7a7ff" },
  openalex: { name: "OpenAlex", color: "#ffb02e" },
}

/** One answer, step by step, as packages/agents/src/answer.ts runs it. */
const STEPS: { title: string; body: string; by: Partner[]; file: string }[] = [
  {
    title: "Your memory, first",
    body: "Before planning, the corrections you've given Konkyo are read from your H-MEM, only the ones about the same thing as this question.",
    by: ["meterless", "nvidia"],
    file: "packages/agents/src/memory.ts",
  },
  {
    title: "The Planner",
    body: "Rewrites the question so it stands alone, plans one to three searches in the words your passages would use, and flags a comparison.",
    by: ["nvidia"],
    file: "packages/agents/src/answer.ts",
  },
  {
    title: "The Retriever",
    body: "Searches your passages by meaning and by words at once and merges the two by rank. Nothing close enough means “Not in your library”, never a guess.",
    by: ["nvidia"],
    file: "packages/agents/src/retrieve.ts",
  },
  {
    title: "The Writer, and a pre-check",
    body: "One finding per sentence, each with a citation and an exact quote, streamed as it writes. Meanwhile Zetaris confirms it holds every document those passages came from.",
    by: ["nvidia", "zetaris"],
    file: "packages/zetaris/src/checks.ts",
  },
  {
    title: "The Analyst, for comparisons",
    body: "Beside the Writer: claims against sources, each stance with a quote checked in Zetaris, kept in your World Model.",
    by: ["nvidia", "zetaris", "meterless"],
    file: "packages/agents/src/analyst.ts",
  },
  {
    title: "The Verifier",
    body: "Each quote in code, then all of them in one Zetaris statement against its own reading of the PDF, while a model judges whether each sentence's quotes support it.",
    by: ["zetaris", "nvidia"],
    file: "packages/zetaris/src/checks.ts",
  },
  {
    title: "Rewrite, or drop",
    body: "Rejected sentences go back to the Writer with the reasons, at most twice. Whatever still fails is dropped; nothing unverified is shown as verified.",
    by: ["nvidia"],
    file: "packages/agents/src/answer.ts",
  },
  {
    title: "The receipt",
    body: "The steps, sources, memories used and the SQL, under the answer; the full trace in logs/<runId>.jsonl. Your 👍 or 👎 goes back to your memory.",
    by: ["meterless"],
    file: "apps/web/components/chat/run-receipt.tsx",
  },
]

/**
 * "Follow one answer": the eight steps of one answer, each
 * tagged with the partners doing the work, linked to their made-with pages, and the file it lives in.
 */
export function FollowAnswer() {
  return (
    <ol className="not-prose my-8 grid gap-3 sm:grid-cols-2">
      {STEPS.map((step, i) => (
        <li
          key={step.title}
          className="flex flex-col gap-2.5 rounded-2xl bg-paper-card p-5 text-ink shadow-[4px_4px_0_rgb(255_250_247/0.14)]"
        >
          <div className="flex items-center gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-lime font-display text-[13px] font-extrabold">
              {i + 1}
            </span>
            <h3 className="font-display text-[19px] leading-tight font-extrabold tracking-[-0.02em]">
              {step.title}
            </h3>
          </div>
          <p className="text-[14.5px] leading-relaxed text-[#3a3036]">{step.body}</p>
          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
            {step.by.map((p) => (
              <a
                key={p}
                href={`${APP_URL}/made-with/${p}`}
                className="rounded-full px-2.5 py-0.5 text-[12px] font-semibold text-ink no-underline transition-transform hover:-translate-y-0.5"
                style={{ background: PARTNERS[p].color }}
              >
                {PARTNERS[p].name} ↗
              </a>
            ))}
            <span className="ml-auto truncate font-mono text-[11.5px] text-[#5f5055]">
              {step.file}
            </span>
          </div>
        </li>
      ))}
    </ol>
  )
}

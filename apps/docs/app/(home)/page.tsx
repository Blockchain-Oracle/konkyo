import { ArrowRight, ArrowUpRight } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Diagram } from "@/components/diagram"
import { Tile } from "@/components/home/tile"
import { LogoRow } from "@/components/logo-row"
import { Phone } from "@/components/phone"
import { Run } from "@/components/run"
import { DOCS, SITE } from "@/lib/site"

export const metadata: Metadata = {
  title: { absolute: `${SITE.name} docs: everything you study, in one library` },
  description: SITE.description,
}

/** The README's problem, step for step: what checking an AI's answer takes today. */
const TODAY = [
  { n: "1", step: "Upload the files and ask." },
  { n: "2", step: "Get a fluent answer with numbered references." },
  {
    n: "3",
    step: "Open each source and hunt for the line behind each sentence,",
    why: "because a reference can point to a page that says something else.",
  },
  {
    n: "4",
    step: "Read the sources side by side to see where they disagree,",
    why: "because one smooth answer rarely says so.",
  },
]

/** The journey the judges score, as the README tells it: answer, passage, receipt. */
const JOURNEY = [
  {
    n: "1",
    title: "Every citation ticked",
    line: "Only once its quote is found word for word in Zetaris.",
    src: "/shots/wide/ask-answer.webp",
    alt: "An answer naming each paper's authors, three ticked citations, and an agree/disagree table.",
  },
  {
    n: "2",
    title: "One click, the passage",
    line: "The paper opens at the page, the quoted lines highlighted.",
    src: "/shots/wide/ask-citation.webp",
    alt: "Citation 1 opened at page 4 of the Nishida and Walker paper, the quote highlighted in amber.",
  },
  {
    n: "3",
    title: "A receipt with the SQL",
    line: "The steps, the models behind the agents, and the SQL Zetaris ran.",
    src: "/shots/wide/ask-receipt.webp",
    alt: "The receipt: steps, models, and the SQL that checked every quote.",
  },
]

const PARTNERS = [
  {
    name: "Zetaris",
    href: `${DOCS.partners}/zetaris`,
    line: "The evidence store. Every quote is checked in one SQL statement against its own reading of the PDF.",
  },
  {
    name: "Meterless",
    href: `${DOCS.partners}/meterless`,
    line: "H-MEM keeps your corrections, the World Model keeps who said what, Markovian screens deep searches.",
  },
  {
    name: "NVIDIA Nemotron",
    href: `${DOCS.partners}/nvidia`,
    line: "Plans answers, embeds every passage, screens finds, guards what's public, stands in for OpenAI.",
  },
]

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[13px] font-semibold tracking-[0.12em] text-fd-muted-foreground uppercase">
      {children}
    </p>
  )
}

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-28 px-4 pt-14 pb-28 sm:px-6 sm:pt-20">
      {/* The hero: the README's line, and the real product. */}
      <section className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
        <div className="flex flex-col gap-6">
          <p className="text-[15px] text-fd-muted-foreground">every answer shows its grounds.</p>
          <h1 className="font-display text-[clamp(1.9rem,3.95vw,3.55rem)] leading-[1.02] font-extrabold tracking-[-0.04em]">
            Everything you study,
            <br />
            in one library.
            <br />
            Agents check
            <br />
            <span className="text-[#e9369d]">every answer.</span>
          </h1>
          <p className="max-w-[46ch] text-[17px] leading-relaxed text-fd-muted-foreground">
            Add papers, lectures and notes; ask, practise, write and listen. Research agents answer
            only from them and check{" "}
            <span className="text-fd-foreground">every quote word for word</span> in Zetaris.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={DOCS.guide}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-lime px-6 text-[15px] font-semibold text-ink transition-transform hover:-translate-y-0.5"
            >
              Read the guide <ArrowRight className="size-4" />
            </Link>
            <a
              href={SITE.app}
              className="inline-flex h-12 items-center gap-2 rounded-full border border-fd-border px-6 text-[15px] font-semibold transition-colors hover:bg-fd-accent"
            >
              Open Konkyo <ArrowUpRight className="size-4" />
            </a>
            <Link
              href={`${DOCS.agents}/a-real-run`}
              className="px-2 text-[15px] font-medium text-fd-muted-foreground underline-offset-4 hover:text-fd-foreground hover:underline"
            >
              See a real run
            </Link>
            <a
              href={SITE.video}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 text-[15px] font-medium text-fd-muted-foreground underline-offset-4 hover:text-fd-foreground hover:underline"
            >
              Watch the demo
            </a>
          </div>
        </div>
        <div className="relative mx-auto flex w-full max-w-[34rem] items-end justify-center">
          <Phone
            src="/shots/phone/space-essay.webp"
            alt="A space on a phone: the essay starter with its sources."
            className="relative z-0 w-[34%] translate-y-6 -rotate-6"
            eager
          />
          <Phone
            src="/shots/phone/ask-answer.webp"
            alt="An answer's agree/disagree table on a phone, each paper's stance quoted."
            className="relative z-10 -mx-6 w-[40%]"
            eager
          />
          <Phone
            src="/shots/phone/brief.webp"
            alt="An audio brief on a phone: six cited lines, each checked before it was recorded."
            className="relative z-0 w-[34%] translate-y-6 rotate-6"
            eager
          />
        </div>
      </section>

      <section className="flex flex-col items-center gap-6">
        <Kicker>Partners doing real work</Kicker>
        <LogoRow />
      </section>

      {/* The problem and the idea, in the README's words, before the run that shows them. */}
      <section id="the-problem" className="flex scroll-mt-24 flex-col gap-10">
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          <div className="flex flex-col gap-4">
            <Kicker>The problem</Kicker>
            <p className="max-w-[46ch] text-[17px] leading-relaxed text-fd-muted-foreground">
              A student revising for an exam, or anyone writing an essay, reads across many sources
              at once: papers, lecture recordings, slides, their own notes. Many now ask an AI to
              pull them together.
            </p>
            <h2 className="font-display text-[clamp(2rem,3.6vw,3rem)] leading-[1.05] font-extrabold tracking-[-0.03em]">
              Then the real work <span className="text-[#e9369d]">starts.</span>
            </h2>
            <p className="max-w-[46ch] text-[16px] leading-relaxed text-fd-muted-foreground">
              Skip steps 3 and 4 and a claim no source makes can end up in the essay. In July 2025,
              NTU Singapore{" "}
              <a
                href="https://www.ntu.edu.sg/sss/news-events/news/detail/ntu-upholds-grade"
                className="text-fd-foreground underline underline-offset-4"
              >
                upheld a zero mark
              </a>{" "}
              on an essay for 14 false citations or data.
            </p>
          </div>
          <ol className="grid gap-4 sm:grid-cols-2">
            {TODAY.map((s) => (
              <li
                key={s.n}
                className={`flex items-start gap-4 rounded-[22px] border bg-fd-card p-5 sm:flex-col sm:p-6 ${s.why ? "border-[#e9369d]/50" : "border-fd-border"}`}
              >
                <span
                  className={`grid size-8 shrink-0 place-items-center rounded-full font-display text-[14px] font-extrabold ${s.why ? "bg-[#e9369d] text-ink" : "border border-fd-border text-fd-muted-foreground"}`}
                >
                  {s.n}
                </span>
                <p className="pt-1 text-[16px] leading-snug sm:pt-0">
                  {s.step}
                  {s.why && <span className="text-fd-muted-foreground"> {s.why}</span>}
                </p>
              </li>
            ))}
          </ol>
        </div>
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          <div className="flex flex-col gap-3 lg:pt-8">
            <Kicker>Where today's tools stop</Kicker>
            <p className="max-w-[46ch] text-[16px] leading-relaxed text-fd-muted-foreground">
              Tools that answer from your uploads now link each sentence to a passage. The link
              shows where the answer looked, not whether the passage says the same thing, so the
              checking is still yours. Research search engines show where published papers agree,
              but only across their own index, not your lectures and notes.
            </p>
          </div>
          <div className="flex flex-col gap-3 rounded-[22px] bg-paper-card p-6 text-ink shadow-[4px_4px_0_rgb(255_250_247/0.14)] sm:p-8">
            <p className="text-[13px] font-semibold tracking-[0.12em] text-[#5f5055] uppercase">
              The idea
            </p>
            <p className="font-display text-[24px] leading-tight font-extrabold tracking-[-0.02em]">
              Konkyo gives the checking to agents.
            </p>
            <p className="text-[16px] leading-relaxed text-[#3a3036]">
              They answer only from your library, and a citation gets its tick only after the
              Verifier finds its quote word for word in Zetaris. A sentence it can't back goes back
              to the Writer, at most twice, and is dropped if it still fails. With{" "}
              <strong className="text-ink">Compare</strong> on, the Analyst lines the sources up
              claim by claim. Your job shrinks from checking every line to clicking a tick to read
              the passage.
            </p>
          </div>
        </div>
      </section>

      {/* The story the track scores, with its real captures. */}
      <section className="flex flex-col gap-10">
        <div className="flex max-w-[52rem] flex-col gap-3">
          <Kicker>Track 02 · the agent that can explain why</Kicker>
          <h2 className="font-display text-[clamp(2rem,3.6vw,3rem)] leading-[1.05] font-extrabold tracking-[-0.03em]">
            One question, three papers, every quote checked.
          </h2>
          <p className="text-[16px] leading-relaxed text-fd-muted-foreground">
            <em>What role do sleep spindles play in memory, and do these papers agree about it?</em>{" "}
            The Planner plans the searches, the Retriever finds the passages, the Writer drafts one
            finding per sentence, the Verifier finds every quote in Zetaris, and the Analyst lines
            the papers up claim by claim. 19 seconds.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {JOURNEY.map((step) => (
            <figure key={step.n} className="flex flex-col gap-3">
              <a
                href={step.src}
                className="block aspect-[16/10] overflow-hidden rounded-[16px] border border-fd-border bg-black"
              >
                {/* biome-ignore lint/performance/noImgElement: a static export; the file is pre-sized */}
                <img
                  src={step.src}
                  alt={step.alt}
                  loading="lazy"
                  className="h-full w-full object-cover object-top transition-transform duration-500 hover:scale-[1.02]"
                />
              </a>
              <figcaption className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-lime font-display text-[13px] font-extrabold text-ink">
                  {step.n}
                </span>
                <span className="flex flex-col">
                  <span className="font-display text-[18px] font-extrabold tracking-[-0.02em]">
                    {step.title}
                  </span>
                  <span className="text-[14px] text-fd-muted-foreground">{step.line}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
        <Diagram
          name="journey"
          alt="The same answer in twelve steps, with its real values: 14 passages from 5 files, 5 of 5 files confirmed in Zetaris, every quote found word for word, 3 claims × 3 sources in the World Model, 19 seconds."
          caption="The run above, agent by agent."
        />
      </section>

      {/* Everything else the library does, each with its real screen. */}
      <section className="flex flex-col gap-8">
        <div className="flex max-w-[52rem] flex-col gap-3">
          <Kicker>The whole library</Kicker>
          <h2 className="font-display text-[clamp(2rem,3.6vw,3rem)] leading-[1.05] font-extrabold tracking-[-0.03em]">
            The same check under every part.
          </h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <Tile
            title="Spaces"
            line="A wall per subject, shared live; its chat can ask @konkyo."
            href={`${DOCS.guide}/spaces`}
            src="/shots/wide/space-essay.webp"
            alt="A space's wall of papers and a note."
            kind="wide"
          />
          <Tile
            title="Bring anything in"
            line="PDFs, slides, web pages, YouTube, lectures, email, Gmail, Drive and Notion."
            href={`${DOCS.guide}/library`}
            src="/shots/wide/library.webp"
            alt="The library with its spaces and sources."
            kind="wide"
          />
          <Tile
            title="Deep search"
            line="Open papers and the web, screened in Markovian steps, then answered."
            href={`${DOCS.agents}/deep-search`}
            src="/shots/phone/deep-search.webp"
            alt="A deep search's agree/disagree table on a phone."
            kind="phone"
          />
          <Tile
            title="Practise"
            line="Quizzes and five games, every answer key checked against its passage."
            href={`${DOCS.guide}/practise`}
            src="/shots/wide/study-why.webp"
            alt="A practice question answered right, with why from the source."
            kind="wide"
          />
          <Tile
            title="Write"
            line="Check my draft marks up to 20 claims supported, partly, contradicted or not found."
            href={`${DOCS.guide}/write`}
            src="/shots/wide/write-check.webp"
            alt="A note with its claims checked."
            kind="wide"
          />
          <Tile
            title="Listen and talk"
            line="Two-voice audio briefs, every fact cited, and an orb you can ask."
            href={`${DOCS.guide}/listen`}
            src="/shots/phone/brief.webp"
            alt="An audio brief player on a phone."
            kind="phone"
          />
          <Tile
            title="Agents and Inbox"
            line="Watches for new papers, placed against what you have."
            href={`${DOCS.guide}/agents-and-inbox`}
            src="/shots/wide/inbox.webp"
            alt="The Inbox with a brief and three papers a watch found."
            kind="wide"
          />
          <Tile
            title="What it knows"
            line="Your corrections and who said what, on a page you can edit."
            href={`${DOCS.guide}/knows`}
            src="/shots/wide/space-knows.webp"
            alt="What a space knows: coming up, where the sources stand."
            kind="wide"
          />
          <Tile
            title="Start in a minute"
            line="A guest, a name and a look; a starter fills your first space."
            href={`${DOCS.guide}/quickstart`}
            src="/shots/phone/sign-in.webp"
            alt="The enter card on a phone."
            kind="phone"
          />
        </div>
      </section>

      {/* The agents at work: a real run, copied from the app. */}
      <section className="grid items-start gap-10 lg:grid-cols-[1fr_1.15fr]">
        <div className="flex flex-col gap-4 lg:sticky lg:top-24">
          <Kicker>The agents at work</Kicker>
          <h2 className="font-display text-[clamp(2rem,3.6vw,3rem)] leading-[1.05] font-extrabold tracking-[-0.03em]">
            A real answer, and its receipt.
          </h2>
          <p className="text-[16px] leading-relaxed text-fd-muted-foreground">
            Nine model roles on two providers, each with a fallback. The Verifier sends unsupported
            sentences back to the Writer, at most twice; what still fails is dropped.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href={DOCS.agents}
              className="inline-flex items-center gap-1.5 text-[15px] font-semibold underline-offset-4 hover:underline"
            >
              Meet the agents <ArrowRight className="size-4" />
            </Link>
            <Link
              href={`${DOCS.agents}/how-answers-are-checked`}
              className="inline-flex items-center gap-1.5 text-[15px] font-semibold underline-offset-4 hover:underline"
            >
              How an answer is checked <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
        <Run
          ask="What role do sleep spindles play in memory, and do these papers agree about it?"
          checked="Checked 10 quotes against 3 sources in Zetaris · 19 s"
          models="Planner nvidia/nemotron-3-ultra-550b-a55b · Writer gpt-6-luna · Verifier gpt-6-luna · Analyst gpt-6-luna"
          steps={[
            { label: "Planning" },
            { label: "Searching your library", detail: "14 passages from 5 files" },
            { label: "Checking sources in Zetaris", detail: "5 of 5 files confirmed" },
            { label: "Comparing sources", detail: "3 claims across 3 sources" },
            { label: "Writing" },
            { label: "Verified 3 citations" },
          ]}
        >
          <p>
            Nishida and Walker report that, after a motor-skill task, greater spindle activity in
            the learning hemisphere relative to the non-learning hemisphere was associated with
            greater offline memory improvement during a nap <sup>1 ✓</sup>. Muehlroth et al. report
            that precise coupling of fast spindles to slow-oscillation peaks promotes
            declarative-memory consolidation across younger and older adults <sup>2 ✓</sup>.
            Diekelmann describes spindles as associated with memory consolidation, but says it
            remains unclear whether their relationship with memory is causal… <sup>3 ✓</sup>
          </p>
        </Run>
      </section>

      <section className="flex flex-col gap-8">
        <div className="flex max-w-[52rem] flex-col gap-3">
          <Kicker>Built on</Kicker>
          <h2 className="font-display text-[clamp(2rem,3.6vw,3rem)] leading-[1.05] font-extrabold tracking-[-0.03em]">
            Three partners, each doing a real job.
          </h2>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {PARTNERS.map((p) => (
            <Link
              key={p.name}
              href={p.href}
              className="group flex flex-col gap-3 rounded-[20px] bg-paper-card p-6 text-ink shadow-[4px_4px_0_rgb(255_250_247/0.14)] transition-transform hover:-translate-y-1"
            >
              <span className="font-display text-[24px] font-extrabold tracking-[-0.02em]">
                {p.name}
              </span>
              <span className="text-[15px] leading-relaxed text-[#3a3036]">{p.line}</span>
              <span className="mt-auto inline-flex items-center gap-1 text-[14px] font-semibold">
                Read <ArrowUpRight className="size-4" />
              </span>
            </Link>
          ))}
        </div>
        <Diagram
          name="system"
          alt="Konkyo's system: the web app and worker on one server, with Postgres and pgvector, publish every file to Zetaris, use three Meterless engines, and call NVIDIA Nemotron and OpenAI with a fallback and a reserve for every agent role."
          caption="The whole system. More in Build → Architecture."
        />
      </section>

      <section className="flex flex-col items-start gap-6 rounded-[28px] bg-lime p-8 text-ink sm:p-12">
        <h2 className="font-display text-[clamp(2rem,3.6vw,3rem)] leading-[1.02] font-extrabold tracking-[-0.03em]">
          Every answer shows its grounds.
        </h2>
        <p className="max-w-[46ch] text-[17px] leading-relaxed">
          Walk in as a guest and ask three real papers, or replay the recorded runs from a fresh
          clone with no keys at all.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href={SITE.app}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-semibold text-[#fffaf7]"
          >
            Open Konkyo <ArrowUpRight className="size-4" />
          </a>
          <Link
            href={`${DOCS.build}/sample-mode`}
            className="inline-flex h-12 items-center gap-2 rounded-full border-2 border-ink px-6 text-[15px] font-semibold"
          >
            Try it with no keys
          </Link>
        </div>
      </section>
    </main>
  )
}

import { APP } from "@konkyo/config"
import { env } from "@konkyo/env/server"
import { readableInk } from "@konkyo/ui/lib/space"
import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import type { CSSProperties } from "react"
import { Suspense } from "react"
import { BrandMark } from "@/components/brand-mark"
import { HeroBoard } from "@/components/landing/hero-board"
import { LazyLiveAnswer } from "@/components/landing/live-answer-lazy"
import { LiveCounts } from "@/components/landing/live-counts"
import { type Vendor, VendorLogo } from "@/components/landing/vendor-logo"
import { liveTotals } from "@/lib/landing"
import { LibraryError } from "@/lib/library"
import { openShare } from "@/lib/shares"

export const metadata: Metadata = {
  title: { absolute: `${APP.name}: ${APP.headline.replace(/\.$/, "")}` },
  description: APP.description,
}

const DOCS = APP.docs ?? "https://docs.konkyo.xyz"

/** Who Konkyo is built on, each opening its made-with page. */
const MAKERS: { vendor: Vendor; body: string }[] = [
  {
    vendor: "zetaris",
    body: "Checks every quote word for word against its own reading of the source.",
  },
  {
    vendor: "meterless",
    body: "Remembers your corrections and which source said what.",
  },
  {
    vendor: "nvidia",
    body: "Nemotron plans your answers, finds their passages and guards what's shared.",
  },
  {
    vendor: "elevenlabs",
    body: "Transcribes your lectures and reads your audio briefs aloud.",
  },
  {
    vendor: "composio",
    body: "Brings in what's waiting in Gmail, Drive and Notion.",
  },
  {
    vendor: "openalex",
    body: "Open papers for deep search when your library runs out.",
  },
]

const AGENTS = [
  ["Planner", "Turns your question into one to three searches, reading your corrections first."],
  ["Retriever", "Searches your sources by meaning and by words at once, and merges the two."],
  ["Writer", "Drafts the answer one finding per sentence, each with its quote."],
  [
    "Verifier",
    "Finds every quote in Zetaris in one statement; a sentence that fails is rewritten.",
  ],
  ["Analyst", "Lines each claim up against each source: agrees, disagrees or partly."],
  ["Tutor", "Makes practice whose answer keys are checked against their passages."],
] as const

/** What it does, only what is built. */
const WAYS = [
  {
    mark: "1",
    color: "var(--color-lime)",
    title: "Ask, and see the passage.",
    body: "Every sentence of an answer carries its citation. Click one and the page opens with the passage highlighted.",
    note: "PDFs, Word, slides, web pages, YouTube and recordings",
  },
  {
    mark: "2",
    color: "var(--color-teal)",
    title: "Every quote, checked word for word.",
    body: "Before you see an answer, each quote is found in its source. A sentence that doesn't hold up is rewritten or dropped, and the receipt says so.",
  },
  {
    mark: "3",
    color: "var(--color-pink)",
    title: "See where sources disagree.",
    body: "Ask across papers and each claim is lined up against each source, with the quote that shows where it agrees, disagrees or only partly does.",
  },
  {
    mark: "4",
    color: "var(--color-butter)",
    title: "Learn it, then prove it.",
    body: "Practice made from your own lectures and readings: recall, fix the false statement, find the evidence. A review each day brings back what you're about to forget.",
  },
  {
    mark: "5",
    color: "var(--color-cobalt)",
    title: "Write with your grounds.",
    body: "Check my draft marks what your sources back, contradict or don't cover. Export to Word in any citation style, or publish it with every claim checked.",
  },
  {
    mark: "6",
    color: "var(--color-orange)",
    title: "Together, and while you're away.",
    body: "Share a space and read with friends live, play a live round on its questions, or forward papers to its own email address. Ask out loud through the orb. Agents watch for new papers and remake a space's audio brief when it changes.",
  },
]

/** "Every kind of reader": each opens a space template. */
const READERS = [
  {
    name: "students",
    color: "#7853ff",
    image: "/landing/students.webp",
    detail: "Exam prep: practice from your lectures and a review each day.",
  },
  {
    name: "essay writers",
    color: "#e9369d",
    image: "/landing/writers.webp",
    detail: "An essay or IA: your sources, your draft, and Check my draft.",
  },
  {
    name: "researchers",
    color: "#3f70ff",
    image: "/landing/researchers.webp",
    detail: "A literature review: deep search and where the papers disagree.",
  },
  {
    name: "reading groups",
    color: "#13b8a6",
    image: "/landing/reading-groups.webp",
    detail: "The week's papers in one space, with an audio brief to listen to.",
  },
  {
    name: "professionals",
    color: "#ff7c42",
    image: "/landing/professionals.webp",
    detail: "Reports from Gmail, Drive and Notion, every quote checked.",
  },
]

async function demoShare() {
  const slug = env.DEMO_SHARE_SLUG
  if (!slug) return null
  try {
    return { slug, share: await openShare(slug) }
  } catch (error) {
    // A missing space or a database blip: the section says where to look instead of the page
    // failing to load (the front door must never go down with the database).
    if (!(error instanceof LibraryError)) console.error("[landing] demo space", error)
    return null
  }
}

/** The live answer, when this server has a demo space; otherwise the section says where to look. */
async function LiveDemo() {
  // At request time: the demo space is configured per server, and the build has no .env.
  await connection()
  const demo = await demoShare()
  if (!demo)
    return (
      <p className="p-6 text-body text-ash-gray">
        The live demo isn't set up on this server. The docs walk through a real answer, its quote
        checks and its trace.
      </p>
    )
  return <LazyLiveAnswer slug={demo.slug} share={demo.share} />
}

/** Real totals across Konkyo (cached for a minute), at request time. */
async function LiveTotals() {
  await connection()
  // The counters are extra: if the database can't answer, they hide and the page still loads.
  const totals = await liveTotals().catch((error: unknown) => {
    console.error("[landing] live totals", error)
    return null
  })
  return totals ? <LiveCounts totals={totals} /> : null
}

function Brand() {
  return (
    <Link href="/" className="about-brand" aria-label={`${APP.name} home`}>
      <BrandMark small className="size-[30px]" />
      <span>{APP.name.toLowerCase()}</span>
    </Link>
  )
}

/**
 * The landing page, told with Konkyo's own
 * story and real data: the hero board is the public sample space, the counters are live, the
 * partners link to the docs that show their use, and the demo asks three real papers.
 */
export default function LandingPage() {
  return (
    <div className="about-page">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="about-wrap about-bar">
        <Brand />
        <nav aria-label="Main" className="about-bar-links">
          <Link href="/demo" className="about-back">
            demo
          </Link>
          <Link href="/pitch" className="about-back">
            pitch
          </Link>
          <a href={DOCS} className="about-back about-docs-link">
            docs
          </a>
          <Link href="/sign-in" className="about-back">
            sign in <span aria-hidden>→</span>
          </Link>
        </nav>
      </header>

      <main id="main">
        <section className="about-wrap about-hero">
          <div className="about-hero-copy">
            <p className="about-intro">every answer shows its grounds.</p>
            <h1>
              Research agents
              <br />
              that check
              <br />
              <span>every quote.</span>
            </h1>
            <p className="about-lede">
              Ask your papers, lectures and notes anything. Agents answer only from them, check{" "}
              <em>every quote word for word</em> in Zetaris, and show where your sources disagree.
            </p>
            <div className="about-hero-actions">
              <Link href="/sign-in" className="about-button is-lime">
                step into the library <span aria-hidden>↗</span>
              </Link>
              <a href="#ask" className="about-text-button">
                ask three real papers <span aria-hidden>↓</span>
              </a>
            </div>
            <p className="about-invitation">
              No account needed: walk in as a guest, and keep it later with Google.
            </p>
          </div>
          <HeroBoard />
        </section>

        <section className="about-wrap about-made" aria-labelledby="made-title">
          <div className="about-section-heading">
            <h2 id="made-title">
              A little help
              <br />
              behind the <span>scenes.</span>
            </h2>
            <p>
              Six partners' tools each do a real job in Konkyo. Follow any of them into the code.
            </p>
          </div>
          <ul className="about-makers">
            {MAKERS.map((m) => (
              <li key={m.vendor}>
                <Link href={`/made-with/${m.vendor}`} className="about-maker-link">
                  <VendorLogo vendor={m.vendor} />
                  <p>{m.body}</p>
                  <small>
                    see how it works <span aria-hidden>↗</span>
                  </small>
                </Link>
              </li>
            ))}
          </ul>
          <details className="about-under-hood">
            <summary>
              For the curious: under the hood <span aria-hidden>+</span>
            </summary>
            <div className="about-tech">
              <p>
                Konkyo is a Next.js app with a background worker, Postgres with pgvector, and object
                storage, on one Coolify server. Each answer passes through six agents, and the
                receipt under it shows what each did.
              </p>
              <dl>
                {AGENTS.map(([name, does]) => (
                  <div key={name}>
                    <dt>{name}</dt>
                    <dd>{does}</dd>
                  </div>
                ))}
              </dl>
              <a href={`${DOCS}/how-answers-are-checked`}>read how an answer is checked ↗</a>
            </div>
          </details>
        </section>

        <div className="about-wrap about-live">
          <span className="about-live-label">
            <i aria-hidden /> across konkyo, right now
          </span>
          <Suspense fallback={<dl aria-hidden className="about-live-pending" />}>
            <LiveTotals />
          </Suspense>
        </div>

        <section className="about-wrap about-how" aria-labelledby="how-title">
          <div className="about-how-heading">
            <h2 id="how-title">
              Good answers
              <br />
              get lost in
              <br />
              <span>the tabs.</span>
            </h2>
            <p>
              Papers in one app, notes in another, a chatbot in a third, and citations nobody opens.
              Konkyo keeps your sources in one place and checks every answer against them.
            </p>
            <img src="/stickers/magnifier.webp" alt="" width={158} height={158} />
          </div>
          <div className="about-ways">
            {WAYS.map((w) => (
              <article key={w.mark}>
                <span
                  className="about-way-mark"
                  style={{ "--way-color": w.color } as CSSProperties}
                  aria-hidden
                >
                  {w.mark}
                </span>
                <div>
                  <h3>{w.title}</h3>
                  <p>{w.body}</p>
                  {w.note && <small className="about-way-note">{w.note}</small>}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="ask" className="about-wrap about-ask" aria-labelledby="ask-title">
          <div className="about-section-heading">
            <h2 id="ask-title">
              Ask three
              <br />
              real <span>papers.</span>
            </h2>
            <p>
              A real shared space of open-access papers on sleep. Ask anything, watch each quote get
              checked, then click a citation to see its passage.
            </p>
          </div>
          <div className="surface-paper paper-sheet about-ask-sheet">
            <Suspense fallback={<div className="h-56" />}>
              <LiveDemo />
            </Suspense>
          </div>
        </section>

        <section className="about-wrap about-rooms" aria-labelledby="readers-title">
          <div className="about-section-heading">
            <h2 id="readers-title">
              Every kind
              <br />
              of <span>reader.</span>
            </h2>
            <p>Start from a space made for how you work; each comes with the right pieces.</p>
          </div>
          <div className="about-room-list">
            {READERS.map((r) => (
              <Link
                key={r.name}
                href="/sign-in"
                className="about-room"
                style={
                  { "--room-color": r.color, "--room-ink": readableInk(r.color) } as CSSProperties
                }
              >
                <span className="about-room-picture">
                  <img src={r.image} alt="" width={120} height={120} />
                </span>
                <span className="about-room-name">{r.name}</span>
                <span className="about-room-detail">{r.detail}</span>
                <span className="about-room-arrow" aria-hidden>
                  ↗
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="about-story" aria-labelledby="story-title">
          <div className="about-wrap about-story-inner">
            <div>
              <span className="about-sticker">why it checks</span>
              <h2 id="story-title">“Only 23 of 319 checked the sources.”</h2>
            </div>
            <div className="about-story-copy">
              <p>
                In a survey of 319 knowledge workers using AI at work, only 23 checked the sources
                it referenced (
                <a href="https://doi.org/10.1145/3706598.3713778">Lee et al., CHI 2025</a>). Another
                study found citations raised trust in an answer even when they were random (
                <a href="https://ojs.aaai.org/index.php/AAAI/article/view/34550">
                  Ding et al., AAAI 2025
                </a>
                ).
              </p>
              <p>
                A citation only helps if someone opens it. So Konkyo opens every one for you, and
                shows you what it found.
              </p>
              <p className="about-signature">
                every quote, checked <span aria-hidden>✓</span>
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="about-wrap about-footer">
        <div className="about-footer-invite">
          <h2>There's room for you.</h2>
          <Link href="/sign-in" className="about-button is-lime">
            come on in <span aria-hidden>↗</span>
          </Link>
        </div>
        <div className="about-footer-meta">
          <Brand />
          <span>Built for the Open Agent Hackathon 2026</span>
          <nav aria-label="Footer" className="about-footer-links">
            <Link href="/demo">demo</Link>
            <Link href="/pitch">pitch</Link>
            <a href={DOCS}>docs</a>
            {APP.repository && <a href={APP.repository}>code</a>}
            <Link href="/privacy">privacy</Link>
            <Link href="/terms">terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}

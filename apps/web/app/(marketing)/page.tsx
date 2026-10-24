import { APP } from "@konkyo/config"
import { env } from "@konkyo/env/server"
import { Button } from "@konkyo/ui/components/button"
import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { connection } from "next/server"
import { Suspense } from "react"
import { BrandMark } from "@/components/brand-mark"
import { LiveAnswer } from "@/components/landing/live-answer"
import { ParticleField } from "@/components/landing/particle-field"
import { RevealLines } from "@/components/landing/reveal"
import { LibraryError } from "@/lib/library"
import { openShare } from "@/lib/shares"

export const metadata: Metadata = {
  title: { absolute: `${APP.name}: ${APP.tagline}` },
  description:
    "A research library whose agents answer only from your sources, check every quote word for word, and show where your sources agree and where they don't.",
}

const JOBS = [
  {
    id: "study",
    label: "Study",
    title: ["Learn it, then", "prove you know it"],
    body: "Quiz yourself from your own lectures and readings. Every answer key is checked against its passage, hints never give the answer away, and spaced repetition brings back what you're about to forget.",
    frame: "max-w-[46rem]",
    image: {
      src: "/landing/study.jpg",
      width: 1420,
      height: 1000,
      alt: "A true-or-false item from a lecture, answered wrong: an amber “Not quite. Try again.” with a hint that doesn't give the answer away.",
    },
  },
  {
    id: "research",
    label: "Research",
    title: ["See where your", "sources disagree"],
    body: "Ask across all your papers at once. The Analyst lines up each claim against each source (agrees, disagrees, partly) with the quote that shows it. When your library runs out, deep search finds and reads new papers.",
    frame: "max-w-[66rem]",
    image: {
      src: "/landing/research.jpg",
      width: 2160,
      height: 1350,
      alt: "An answer comparing three sleep papers, with verified citations and an agree/disagree table of four claims across the three sources.",
    },
  },
  {
    id: "write",
    label: "Write",
    title: ["Cite while", "you write"],
    body: "Select a sentence and find the passage that supports it. Check my draft marks what your sources back, contradict, or don't cover at all. Export to Word in any citation style.",
    frame: "max-w-[80rem]",
    image: {
      src: "/landing/write.jpg",
      width: 2340,
      height: 1000,
      alt: "A note checked against its sources: two claims supported, and one, that older adults gain as much from sleep, contradicted.",
    },
  },
]

const BUILT_ON = [
  {
    name: "Zetaris",
    body: "The evidence store. Every quote is checked in one SQL statement against Zetaris's own reading of the source; without it, nothing is marked verified.",
  },
  {
    name: "Meterless",
    body: "Memory and world state: H-MEM keeps your corrections, the World Model keeps which source said what, and Markovian keeps deep search lean.",
  },
  {
    name: "OpenAI",
    body: "The models that plan, write, verify and compare, each chosen by a measured benchmark for its role.",
  },
]

function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-30">
      <div className="mx-auto flex h-16 max-w-[90rem] items-center gap-6 px-5 sm:px-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-nav-label font-semibold text-bone-white uppercase"
        >
          <BrandMark small className="size-5" />
          {APP.name}
        </Link>
        <nav aria-label="Sections" className="hidden items-center gap-6 md:flex">
          {[
            ["#answer", "Live answer"],
            ["#study", "Study"],
            ["#research", "Research"],
            ["#write", "Write"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="text-nav-label text-silver-mist uppercase transition-colors hover:text-bone-white"
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            className="px-4"
            nativeButton={false}
            render={<Link href="/sign-in" />}
          >
            Sign in
          </Button>
          <Button className="px-4" nativeButton={false} render={<Link href="/sign-in" />}>
            Start free
          </Button>
        </div>
      </div>
    </header>
  )
}

async function demoShare() {
  const slug = env.DEMO_SHARE_SLUG
  if (!slug) return null
  try {
    return { slug, share: await openShare(slug) }
  } catch (error) {
    if (error instanceof LibraryError) return null
    throw error
  }
}

/** The live answer, when this server has a demo folder; otherwise the section says where to look. */
async function LiveDemo() {
  // At request time: the demo folder is configured per server, and the build has no .env.
  await connection()
  const demo = await demoShare()
  if (!demo)
    return (
      <p className="rounded-card border border-border bg-black/70 p-6 text-body font-extralight text-silver-mist">
        The live demo isn't set up on this server. The recorded examples in the repository show real
        runs, quote checks and traces.
      </p>
    )
  return <LiveAnswer slug={demo.slug} share={demo.share} />
}

/**
 * The landing page (plan §8), after Dala's live site: one particle field that becomes a brain, a
 * swarm, an open book and the Konkyo mark as you scroll; headlines revealed line by line.
 */
export default function LandingPage() {
  return (
    <div className="relative isolate overflow-x-clip">
      <ParticleField />
      <Header />

      <main>
        {/* 1. A brain. */}
        <section
          data-stage="0"
          data-dim="1"
          className="mx-auto flex min-h-svh max-w-[90rem] flex-col justify-center px-5 pt-24 pb-16 sm:px-10"
        >
          <p className="text-micro text-saffron-spark uppercase">
            A research library that checks itself
          </p>
          <RevealLines
            as="h1"
            immediate
            lines={["Every answer", "shows its", "grounds."]}
            className="mt-6 text-heading font-normal text-bone-white sm:text-heading-lg xl:text-display"
          />
          <p className="mt-8 max-w-[34rem] text-body font-extralight text-pretty text-bone-white">
            Konkyo reads your papers, lectures and notes. Ask it anything: its agents answer only
            from your sources, check every quote word for word, and show you where the sources agree
            and where they don't.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              className="h-11 px-6"
              nativeButton={false}
              render={<Link href="/sign-in" />}
            >
              Start free
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="h-11 px-5"
              nativeButton={false}
              render={<a href="#answer" />}
            >
              See a checked answer
            </Button>
          </div>
        </section>

        {/* 2. The swarm: the problem. */}
        <section
          data-stage="1"
          data-dim="0.55"
          className="mx-auto flex min-h-[90svh] max-w-[64rem] flex-col items-center justify-center px-5 py-24 text-center sm:px-10"
        >
          <p className="text-micro text-saffron-spark uppercase">Why it checks</p>
          <RevealLines
            lines={["Only 23 of 319", "knowledge workers", "checked the sources", "AI gave them."]}
            className="mt-6 text-heading-sm font-normal text-bone-white sm:text-heading lg:text-heading-lg"
          />
          <p className="mt-8 max-w-[38rem] text-body font-extralight text-pretty text-bone-white">
            Citations make an answer look trustworthy whether or not anyone opens them. So Konkyo
            opens every one for you: each quote is found, word for word, in its source before you
            see the answer.
          </p>
          <a
            href="https://doi.org/10.1145/3706598.3713778"
            className="mt-5 text-meta text-ash-gray underline-offset-4 hover:text-silver-mist hover:underline"
          >
            Lee et al., CHI 2025
          </a>
        </section>

        {/* 3. A live checked answer; the swarm dims behind it. */}
        <section
          id="answer"
          data-stage="1"
          data-dim="0.22"
          className="mx-auto max-w-[56rem] scroll-mt-16 px-5 py-24 sm:px-10"
        >
          <p className="text-micro text-saffron-spark uppercase">Try it, live</p>
          <RevealLines
            lines={["Ask three", "real papers"]}
            className="mt-6 text-heading-sm font-normal text-bone-white sm:text-heading"
          />
          <p className="mt-6 max-w-[38rem] text-body font-extralight text-pretty text-bone-white">
            A real shared folder of open-access papers. Ask anything, watch each quote get checked,
            then click a citation to see the passage it came from.
          </p>
          <div className="mt-10">
            <Suspense
              fallback={<div className="h-56 rounded-card border border-border bg-black/70" />}
            >
              <LiveDemo />
            </Suspense>
          </div>
        </section>

        {/* 4. The book: what it's for. */}
        <div data-stage="2" data-dim="0.5">
          {JOBS.map((job) => (
            <section
              key={job.id}
              id={job.id}
              className="mx-auto grid max-w-[90rem] scroll-mt-16 gap-8 px-5 py-20 sm:px-10 lg:grid-cols-2 lg:gap-16 lg:py-28"
            >
              <RevealLines
                lines={job.title}
                className="text-heading-sm font-normal text-bone-white sm:text-heading lg:text-heading-lg"
              />
              <div className="lg:pt-4">
                <p className="text-micro text-saffron-spark uppercase">{job.label}</p>
                <p className="mt-4 max-w-[34rem] text-body font-extralight text-pretty text-bone-white">
                  {job.body}
                </p>
              </div>
              {/* A real screen from the product, captured from the sample library. */}
              <Image
                src={job.image.src}
                width={job.image.width}
                height={job.image.height}
                alt={job.image.alt}
                sizes="(min-width: 1440px) 1360px, 100vw"
                className={`w-full justify-self-center rounded-card border border-line-strong lg:col-span-2 ${job.frame}`}
              />
            </section>
          ))}

          {/* 5. Built on. */}
          <section className="mx-auto max-w-[90rem] px-5 py-20 sm:px-10 lg:py-28">
            <p className="text-micro text-saffron-spark uppercase">Built on</p>
            <ul className="mt-8 grid gap-px overflow-hidden rounded-card border border-border bg-border md:grid-cols-3">
              {BUILT_ON.map((b) => (
                <li key={b.name} className="bg-black/80 p-7 backdrop-blur-sm">
                  <p className="text-heading-2xs text-bone-white">{b.name}</p>
                  <p className="mt-3 text-reading font-extralight text-pretty text-silver-mist">
                    {b.body}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* 6. The Konkyo mark. */}
        <section
          data-stage="3"
          data-dim="1"
          className="mx-auto flex min-h-svh max-w-[64rem] flex-col items-center justify-end px-5 pb-[18svh] text-center sm:px-10"
        >
          <RevealLines
            lines={["Start with your", "own sources."]}
            className="text-heading-sm font-normal text-bone-white sm:text-heading lg:text-heading-lg"
          />
          <Button
            size="lg"
            className="mt-10 h-11 px-6"
            nativeButton={false}
            render={<Link href="/sign-in" />}
          >
            Start free
          </Button>
          <p className="mt-4 text-snippet text-ash-gray">
            Free. Sign in with Google, or try it as a guest.
          </p>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-x-6 gap-y-3 px-5 py-8 text-meta text-ash-gray sm:px-10">
          <span className="inline-flex items-center gap-2 text-bone-white">
            <BrandMark small className="size-4" />
            {APP.name}
          </span>
          <span>Built for the Open Agent Hackathon 2026</span>
          <nav aria-label="Footer" className="ml-auto flex gap-5">
            {APP.docs && (
              <a href={APP.docs} className="hover:text-silver-mist">
                Docs
              </a>
            )}
            {APP.repository && (
              <a href={APP.repository} className="hover:text-silver-mist">
                GitHub
              </a>
            )}
            <Link href="/privacy" className="hover:text-silver-mist">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-silver-mist">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}

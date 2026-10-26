import { APP } from "@konkyo/config"
import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { BrandMark } from "@/components/brand-mark"
import styles from "./page.module.css"

export const metadata: Metadata = {
  title: "Demo",
  description:
    "See how Konkyo answers from real papers, checks each quote, and lets you inspect the source and receipt.",
}

// Add the official recording's YouTube ID when it is published. Until then the page explicitly
// presents the live product and recorded sample evidence, without suggesting the still is a video.
const DEMO_YOUTUBE_ID = ""

export default function DemoPage() {
  return (
    <div className="about-page">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="about-wrap about-bar">
        <Link href="/" className="about-brand" aria-label="Konkyo home">
          <BrandMark small className="size-[30px]" />
          <span>konkyo</span>
        </Link>
        <nav aria-label="Main" className="about-bar-links">
          <Link href="/demo" className="about-back" aria-current="page">
            demo
          </Link>
          <a href={APP.docs ?? "https://docs.konkyo.xyz"} className="about-back">
            docs
          </a>
          <Link href="/sign-in" className="about-back">
            sign in <span aria-hidden>→</span>
          </Link>
        </nav>
      </header>

      <main id="main" className={styles.main}>
        <section className={`about-wrap ${styles.hero}`}>
          <p className={styles.eyebrow}>Konkyo / product walkthrough</p>
          <h1>
            See an answer earn <span>its grounds.</span>
          </h1>
          <p className={styles.lede}>
            Ask across real papers. Follow each quote into its source. Open the receipt to see what
            passed the check.
          </p>
        </section>

        <section className={`about-wrap ${styles.feature}`} aria-label="Demo video">
          {DEMO_YOUTUBE_ID ? (
            <div className={styles.player}>
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${DEMO_YOUTUBE_ID}`}
                title="Konkyo product demo"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          ) : (
            <figure className={styles.still}>
              {/* The image is a dated capture of the real landing page, not a recording. */}
              <Image
                src="/demo/landing-capture.jpg"
                alt="Konkyo's live landing page showing a sample paper, a cited answer, and its checked quote"
                width={1280}
                height={720}
                priority
              />
              <figcaption>
                The video walkthrough is being recorded. This is the live product.
              </figcaption>
            </figure>
          )}
          <div className={styles.next}>
            <p className={styles.nextLabel}>Try the product now</p>
            <p>
              The landing page lets you ask three real papers without an account. You can also enter
              as a guest and follow an answer from question to highlighted passage.
            </p>
            <div className={styles.actions}>
              <Link href="/#ask" className="about-button is-lime">
                ask the sample papers <span aria-hidden>↗</span>
              </Link>
              <Link href="/sign-in" className={styles.secondary}>
                step into the library <span aria-hidden>↗</span>
              </Link>
            </div>
          </div>
        </section>

        <section className={`about-wrap ${styles.steps}`} aria-labelledby="demo-steps-title">
          <div className={styles.stepsHeading}>
            <p className={styles.eyebrow}>The journey</p>
            <h2 id="demo-steps-title">What to look for.</h2>
          </div>
          <ol>
            <li>
              <span>01</span>
              <h3>Ask across sources</h3>
              <p>
                Start with the sample papers or bring your own PDFs, slides, notes, and recordings.
              </p>
            </li>
            <li>
              <span>02</span>
              <h3>Read the checked answer</h3>
              <p>
                Each cited quote must pass the source check. Open the receipt for the steps and SQL.
              </p>
            </li>
            <li>
              <span>03</span>
              <h3>Open the grounds</h3>
              <p>Click a citation to see the original page and its highlighted passage.</p>
            </li>
          </ol>
          <p className={styles.proof}>
            Want a run you can inspect without keys?{" "}
            <a href="https://docs.konkyo.xyz/sample-mode">Replay the recorded sample</a> and read
            its trace.
          </p>
        </section>
      </main>
    </div>
  )
}

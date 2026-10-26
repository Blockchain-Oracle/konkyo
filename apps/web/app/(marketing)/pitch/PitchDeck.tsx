"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"
import { BrandMark } from "@/components/brand-mark"
import { MILESTONES, PITCH } from "./copy"
import styles from "./page.module.css"

export function PitchDeck() {
  const [index, setIndex] = useState(0)
  const slide = PITCH[index] ?? PITCH[0]

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("input, textarea, select, [contenteditable]")
      )
        return
      if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(event.key)) {
        event.preventDefault()
        setIndex((current) => Math.min(PITCH.length - 1, current + 1))
      } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) {
        event.preventDefault()
        setIndex((current) => Math.max(0, current - 1))
      } else if (event.key === "Home") setIndex(0)
      else if (event.key === "End") setIndex(PITCH.length - 1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <main className={styles.deck} data-theme={slide.theme} aria-label="Konkyo pitch">
      <div className={styles.frame}>
        <header className={styles.header}>
          <Link href="/" className={styles.brand} aria-label="Konkyo home">
            <BrandMark small className={styles.mark} />
            <span>konkyo</span>
          </Link>
          <div className={styles.headerRight}>
            <Link href="/demo">demo ↗</Link>
            <span className={styles.folio}>
              {String(index + 1).padStart(2, "0")} / {String(PITCH.length).padStart(2, "0")} ·{" "}
              {slide.label}
            </span>
          </div>
        </header>

        <section key={slide.id} className={styles.stage} aria-live="polite" aria-atomic="true">
          <article
            key={slide.id}
            className={styles.slide}
            aria-label={`Slide ${index + 1}: ${slide.label}`}
          >
            <div className={styles.copy}>
              <p className={styles.eyebrow}>{slide.eyebrow}</p>
              <h1>{slide.title}</h1>
              <p className={styles.body}>{slide.body}</p>
              {slide.id === "demo" ? (
                <Link href="/demo" className={styles.cta}>
                  open the demo <span aria-hidden>↗</span>
                </Link>
              ) : null}
              {slide.id === "product" ? (
                <div className={styles.links}>
                  <Link href="/#ask" className={styles.cta}>
                    try three real papers <span aria-hidden>↗</span>
                  </Link>
                  <a href="https://docs.konkyo.xyz/how-answers-are-checked">
                    how the check works ↗
                  </a>
                </div>
              ) : null}
            </div>

            {slide.id === "demo" ? (
              <figure className={styles.capture}>
                <Image
                  src="/demo/landing-capture.jpg"
                  alt="Konkyo landing page with a sample paper and its cited answer"
                  width={1280}
                  height={720}
                  priority
                />
                <figcaption>Live product · recording pending</figcaption>
              </figure>
            ) : null}
            {slide.id === "problem" ? (
              <div className={styles.questions}>
                <span>01 / Which source?</span>
                <span>02 / Which exact words?</span>
                <span>03 / How do they support the answer?</span>
              </div>
            ) : null}
            {slide.id === "product" ? (
              <ol className={styles.steps}>
                <li>
                  <span>01 / ASK</span>
                  <strong>Your library is the starting point.</strong>
                </li>
                <li>
                  <span>02 / CHECK</span>
                  <strong>Each quote is checked in Zetaris.</strong>
                </li>
                <li>
                  <span>03 / OPEN</span>
                  <strong>The passage and receipt are one click away.</strong>
                </li>
              </ol>
            ) : null}
            {slide.id === "milestones" ? (
              <ol className={styles.milestones}>
                {MILESTONES.map((milestone) => (
                  <li key={milestone.label}>
                    <span>{milestone.label}</span>
                    <strong>{milestone.text}</strong>
                  </li>
                ))}
              </ol>
            ) : null}
          </article>
        </section>

        <footer className={styles.footer}>
          <span className={styles.footerHint}>← → or space to move</span>
          <nav className={styles.dots} aria-label="Pitch slides">
            {PITCH.map((item, dot) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setIndex(dot)}
                aria-label={`Go to slide ${dot + 1}: ${item.label}`}
                aria-current={dot === index ? "step" : undefined}
              />
            ))}
          </nav>
          <div className={styles.arrows}>
            <button
              type="button"
              onClick={() => setIndex((current) => Math.max(0, current - 1))}
              disabled={index === 0}
              aria-label="Previous slide"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => setIndex((current) => Math.min(PITCH.length - 1, current + 1))}
              disabled={index === PITCH.length - 1}
              aria-label="Next slide"
            >
              →
            </button>
          </div>
        </footer>
      </div>
    </main>
  )
}

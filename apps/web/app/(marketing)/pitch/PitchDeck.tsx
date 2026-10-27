"use client"

import type { Route } from "next"
import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"
import { BrandMark } from "@/components/brand-mark"
import { PITCH, type Picture, type Slide } from "./copy"
import styles from "./page.module.css"

function Photo({ picture, priority }: { picture: Picture; priority?: boolean }) {
  return (
    <Image
      src={picture.src}
      alt={picture.alt}
      width={picture.width}
      height={picture.height}
      sizes="(max-width: 700px) 100vw, 55vw"
      priority={priority}
    />
  )
}

/** The right-hand side of a slide: whatever shows the point, as a picture or a list of cards. */
function Visual({ slide, priority }: { slide: Slide; priority: boolean }) {
  const visual = slide.visual
  switch (visual.kind) {
    case "capture":
      return (
        <figure className={styles.capture}>
          <Photo picture={visual.picture} priority={priority} />
          <figcaption>{visual.picture.caption}</figcaption>
        </figure>
      )
    case "picture":
      return (
        <figure className={styles.picture}>
          <Photo picture={visual.picture} priority={priority} />
          <figcaption>{visual.picture.caption}</figcaption>
        </figure>
      )
    case "cards":
      return (
        <ol
          className={styles.cards}
          data-columns={visual.columns ?? 1}
          data-dense={visual.dense ? "" : undefined}
        >
          {visual.items.map((item) => (
            <li key={`${item.label}${item.text}`}>
              <span>{item.label}</span>
              <strong>{item.text}</strong>
            </li>
          ))}
        </ol>
      )
    case "shots":
      return (
        <div className={styles.shots}>
          {visual.pictures.map((picture) => (
            <figure key={picture.src}>
              <Photo picture={picture} />
              <figcaption>{picture.caption}</figcaption>
            </figure>
          ))}
        </div>
      )
  }
}

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

  if (!slide) return null
  const [first, ...rest] = slide.links ?? []

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
            data-layout={slide.layout}
            aria-label={`Slide ${index + 1}: ${slide.label}`}
          >
            <div className={styles.copy}>
              <p className={styles.eyebrow}>{slide.eyebrow}</p>
              <h1 data-long={slide.title.length > 20 ? "" : undefined}>{slide.title}</h1>
              <p className={styles.body}>{slide.body}</p>
              {first ? (
                <div className={styles.links}>
                  {first.external ? (
                    <a href={first.href} className={styles.cta}>
                      {first.text} <span aria-hidden>↗</span>
                    </a>
                  ) : (
                    <Link href={first.href as Route} className={styles.cta}>
                      {first.text} <span aria-hidden>↗</span>
                    </Link>
                  )}
                  {rest.map((link) =>
                    link.external ? (
                      <a key={link.href} href={link.href}>
                        {link.text} ↗
                      </a>
                    ) : (
                      <Link key={link.href} href={link.href as Route}>
                        {link.text} ↗
                      </Link>
                    ),
                  )}
                </div>
              ) : null}
            </div>
            <Visual slide={slide} priority={index === 0} />
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

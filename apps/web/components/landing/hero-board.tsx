"use client"

import { useState } from "react"
import { askOnLanding, citeOnLanding } from "./ask-event"

/** The passage the answer cites, word for word from page one of Nishida & Walker (2007). */
const QUOTE =
  "These results demonstrate that motor memories are dynamically facilitated across daytime naps"

/** A question the three papers answer (checked against them on testing), asked live below. */
const TRY = "Does sleep help memory the same way in older adults?"

/**
 * The landing's tilted space: the real
 * public sample space ("Essay starter: Sleep and learning") as a wall. The polaroid is page one of
 * one of its papers, the answer card quotes that page, and its citation opens the passage on paper
 * with the highlighter. The note asks the live demo further down the page.
 */
export function HeroBoard() {
  const [open, setOpen] = useState(false)
  return (
    <div className="about-preview">
      <div className="about-board-frame">
        <div className="about-board">
          <span className="about-board-label">
            essay starter: sleep and learning <span aria-hidden>✳</span>
          </span>
          <figure className="about-photo">
            <img
              src="/landing/sample-naps.webp"
              alt="Page one of “Daytime Naps, Motor Memory Consolidation and Regionally Specific Sleep Spindles”"
              width={480}
              height={620}
            />
            <figcaption>naps &amp; motor memory · p. 1</figcaption>
          </figure>
          <img
            className="about-ours"
            src="/stickers/grounds-stamp.webp"
            alt=""
            width={160}
            height={160}
          />

          <div className="about-answer" aria-live="polite">
            {open ? (
              <>
                <span className="about-answer-kicker">Nishida &amp; Walker, 2007 · p. 1</span>
                <blockquote>
                  “<mark className="about-hl">{QUOTE}</mark>.”
                </blockquote>
                <span className="about-answer-found">✓ found word for word in the paper</span>
                <button type="button" className="about-answer-back" onClick={() => setOpen(false)}>
                  ← the answer
                </button>
              </>
            ) : (
              <>
                <span className="about-answer-kicker">asked this space</span>
                <h2>Does a daytime nap help motor learning?</h2>
                <p>
                  Yes. In Nishida and Walker's study, motor memories were “dynamically facilitated
                  across daytime naps”
                  <button
                    type="button"
                    className="about-cite"
                    aria-label="Open citation 1: the passage on page 1"
                    onClick={() => {
                      setOpen(true)
                      citeOnLanding({ title: "Daytime Naps", page: 1, quote: QUOTE })
                    }}
                  >
                    1
                  </button>
                </p>
                <span className="about-receipt">✓ 1 quote checked</span>
              </>
            )}
          </div>

          <button type="button" className="about-note" onClick={() => askOnLanding(TRY)}>
            <span>try one</span>
            <p>
              does sleep help memory the same way in <strong>older adults?</strong>
            </p>
            <small>ask it below ↓</small>
          </button>
          <img
            className="about-cake"
            src="/stickers/checked.webp"
            alt=""
            width={160}
            height={160}
          />
          <span className="about-board-tag">every quote, checked.</span>
        </div>
      </div>
      <p className={open ? "about-preview-caption has-vote" : "about-preview-caption"}>
        <span aria-hidden>✳</span>
        {open
          ? "That's the passage, word for word. Ask your own below."
          : "A real space: three open-access papers on sleep. Go on, click the 1."}
      </p>
    </div>
  )
}

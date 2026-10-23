"use client"

import { Button } from "@konkyo/ui/components/button"
import { useEffect, useRef, useState } from "react"

const DONE_KEY = "konkyo.tour.citation"
const CHIP = 'button[aria-label^="Citation "][aria-label$="Verified."]'
const PANE = 'section[aria-label="Source"]'

type Step = "citation" | "passage" | null

function done() {
  try {
    return localStorage.getItem(DONE_KEY) === "1"
  } catch {
    return false
  }
}
function finish() {
  try {
    localStorage.setItem(DONE_KEY, "1")
  } catch {
    // Private windows may refuse storage; the tour simply shows again next time.
  }
}

/** The element's box, kept current while the page scrolls or resizes. */
function useBox(selector: string | null) {
  const [box, setBox] = useState<DOMRect | null>(null)
  useEffect(() => {
    if (!selector) return setBox(null)
    let frame = 0
    const measure = () => {
      const el = document.querySelector(selector)
      setBox(el ? el.getBoundingClientRect() : null)
      frame = requestAnimationFrame(measure)
    }
    measure()
    return () => cancelAnimationFrame(frame)
  }, [selector])
  return box
}

/**
 * The first-run tour (plan F39, §7.5 after Attio's): once the starter's answer has a verified
 * citation, a spotlight asks for a click on it, and moves on only after a real click; then it
 * points at the passage that opened. Two steps, Esc to leave; shown once per browser.
 */
export function CitationTour() {
  const [step, setStep] = useState<Step>(null)
  // Only on the Research starter's chat (?tour=1), and only until it's been seen.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tour") === "1" && !done())
      setStep("citation")
  }, [])

  // Step 1 advances on a real click on any verified citation (the chip opens the passage).
  useEffect(() => {
    if (step !== "citation") return
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest(CHIP)) setStep("passage")
    }
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [step])

  useEffect(() => {
    if (!step) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        finish()
        setStep(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [step])

  const selector = step === "citation" ? CHIP : step === "passage" ? PANE : null
  const box = useBox(selector)
  // Each step brings its target into view once, when it first appears.
  const shown = useRef<Step>(null)
  useEffect(() => {
    if (!step || !box || !selector || shown.current === step) return
    shown.current = step
    document.querySelector(selector)?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [step, box, selector])
  if (!step || !box || !selector) return null

  const leave = () => {
    finish()
    setStep(null)
  }
  // The chat can scroll its target away (a streaming answer follows the newest line): then the
  // page isn't dimmed (a dimmed page with nothing lit is a black screen) and the card waits at
  // the bottom with a way back to it.
  const visible = box.bottom > 0 && box.top < window.innerHeight
  if (!visible)
    return (
      <div
        role="dialog"
        aria-label="Tour"
        className="fixed inset-x-4 bottom-24 z-[70] mx-auto max-w-sm rounded-card border border-line-strong bg-overlay p-4 shadow-xl md:bottom-6"
      >
        <p className="text-ui text-bone-white">
          {step === "passage" ? "The passage is open" : "Every claim points to its source"}
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={leave}>
            Skip
          </Button>
          <Button
            size="sm"
            onClick={() =>
              document
                .querySelector(selector)
                ?.scrollIntoView({ block: "center", behavior: "smooth" })
            }
          >
            Show me
          </Button>
        </div>
      </div>
    )

  const pad = step === "citation" ? 6 : 0
  const cardWidth = 300
  const below = box.bottom + 180 < window.innerHeight
  const left = Math.max(12, Math.min(box.left - 8, window.innerWidth - cardWidth - 12))
  const passage = step === "passage"

  return (
    <>
      {/* Above the source sheet (z-50), which step 2 points into. */}
      {/* The spotlight: everything dims but the target; clicks pass through to it. */}
      <div
        aria-hidden
        className="pointer-events-none fixed z-[70] rounded-lg ring-2 ring-electric-iris/80 transition-all duration-300 motion-reduce:transition-none"
        style={{
          top: box.top - pad,
          left: box.left - pad,
          width: box.width + pad * 2,
          height: box.height + pad * 2,
          boxShadow: passage ? undefined : "0 0 0 9999px rgb(0 0 0 / 0.55)",
        }}
      />
      <div
        role="dialog"
        aria-label="Tour"
        className="fixed z-[70] rounded-card border border-line-strong bg-overlay p-4 shadow-xl"
        style={
          passage
            ? // Low in the pane, above its "Right passage?" bar: the viewer puts the cited line a
              // quarter of the way down, so the card never covers it.
              {
                bottom: window.innerHeight - box.bottom + 84,
                left: Math.max(12, box.left + 16),
                width: cardWidth,
              }
            : below
              ? { top: box.bottom + 14, left, width: cardWidth }
              : { bottom: window.innerHeight - box.top + 14, left, width: cardWidth }
        }
      >
        <p className="text-meta text-ash-gray">{passage ? "2 of 2" : "1 of 2"}</p>
        <p className="mt-1.5 text-ui text-bone-white">
          {passage ? "The exact passage, highlighted" : "Every claim points to its source"}
        </p>
        <p className="mt-1 text-snippet text-pretty text-silver-mist">
          {passage
            ? "The quote is marked where it sits in the paper. Zetaris found it there, word for word, before you saw the answer."
            : "Click this citation to open the passage it came from."}
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={leave}>
            {passage ? "Done" : "Skip"}
          </Button>
        </div>
      </div>
    </>
  )
}

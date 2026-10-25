"use client"

/*
 * Ported from OurSpaces (https://github.com/thomasnguyen/ourspaces-app, src/components/OrbHint.tsx),
 * MIT licence, Copyright (c) 2026 Thomas Nguyen. The slip, its pinning to the orb and its fold into
 * the orb on the first ask are theirs; Konkyo's starters are the place's own example asks.
 *
 * One black slip pinned above the orb the first time a browser lands with the dock: it names the
 * move (tap the orb and talk) and carries three starter asks that play through the orb. `?hint=1`
 * forces it, `?hint=0` hides it; otherwise it shows once per browser.
 */

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"

export const ORB_HINT_KEY = "konkyo:orb-hint"

const ORB = ".dock-voice-orb"
/** The fold into the orb (`orb-hint-out`). */
const LEAVE_MS = 260

export function orbHintWanted() {
  const param = new URLSearchParams(window.location.search).get("hint")
  if (param === "0") return false
  if (param === "1") return true
  try {
    return window.localStorage.getItem(ORB_HINT_KEY) !== "seen"
  } catch {
    return true
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(ORB_HINT_KEY, "seen")
  } catch {
    /* private mode: it shows again next time, which is fine */
  }
}

export function OrbHint({
  spaceName,
  starters,
  onAsk,
  onGone,
}: {
  spaceName: string | null
  starters: string[]
  onAsk: (words: string) => void
  onGone: () => void
}) {
  const node = useRef<HTMLDivElement>(null)
  const [leaving, setLeaving] = useState(false)
  const leavingRef = useRef(false)

  /* Pinned to the orb: its centre x and the dock's top edge, re-read while the dock settles. */
  const pin = useCallback(() => {
    const el = node.current
    const orb = document.querySelector<HTMLElement>(ORB)
    if (!el || !orb) return
    const r = orb.getBoundingClientRect()
    if (!r.width) return
    el.style.setProperty("--orb-x", `${Math.round(r.left + r.width / 2)}px`)
    el.style.setProperty("--orb-top", `${Math.round(r.top)}px`)
  }, [])
  useLayoutEffect(() => {
    pin()
    const timers = [300, 900, 1600].map((ms) => window.setTimeout(pin, ms))
    window.addEventListener("resize", pin)
    return () => {
      for (const t of timers) window.clearTimeout(t)
      window.removeEventListener("resize", pin)
    }
  }, [pin])

  const leave = useCallback(() => {
    if (leavingRef.current) return
    leavingRef.current = true
    markSeen()
    setLeaving(true)
    window.setTimeout(onGone, LEAVE_MS)
  }, [onGone])

  /* The first ask, however it starts: the dock strip leaves idle, or the stage comes up. Opening
     anything else on the dock (the sounds menu, catch me up) folds it too: you've found the dock. */
  useEffect(() => {
    const dock = document.querySelector<HTMLElement>(".dock-voice")
    const check = () => {
      if (
        document.body.classList.contains("voice-stage-up") ||
        document.body.classList.contains("dock-menu-open") ||
        (dock && !dock.classList.contains("is-idle"))
      )
        leave()
    }
    check()
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && leave()
    window.addEventListener("keydown", onKey)
    const watch = new MutationObserver(check)
    watch.observe(document.body, { attributes: true, attributeFilter: ["class"] })
    if (dock) watch.observe(dock, { attributes: true, attributeFilter: ["class"] })
    return () => {
      watch.disconnect()
      window.removeEventListener("keydown", onKey)
    }
  }, [leave])

  // on the body: the dock is transformed, which would make `position: fixed` relative to it
  return createPortal(
    <section
      ref={node}
      className={`orb-hint${leaving ? " is-leaving" : ""}`}
      data-leaving={leaving ? "1" : "0"}
      aria-label="Tip: talk to Konkyo"
    >
      <p className="orb-hint-kicker">
        <i aria-hidden="true" />
        {spaceName ? `${spaceName.toLowerCase()} · you're in` : "your library · you're in"}
      </p>
      <h2>tap the orb and talk</h2>
      <p className="orb-hint-sub">
        ask your sources out loud and it answers, checked and read back to you. or try one:
      </p>
      <ul>
        {starters.map((words, i) => (
          <li key={words} style={{ "--i": i } as CSSProperties}>
            <button
              type="button"
              onClick={() => {
                onAsk(words)
                leave()
              }}
            >
              <span aria-hidden="true">▶</span>
              {words}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="orb-hint-dismiss"
        title="later"
        aria-label="Dismiss the tip"
        onClick={leave}
      >
        <span aria-hidden="true">×</span>
      </button>
    </section>,
    document.body,
  )
}

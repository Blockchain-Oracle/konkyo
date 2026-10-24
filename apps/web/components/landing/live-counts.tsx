"use client"

import NumberFlow from "@number-flow/react"
import { useEffect, useRef, useState } from "react"
import type { LiveTotals } from "@/lib/landing"

const ROWS = [
  ["spaces", "spaces"],
  ["sources", "sources read"],
  ["quotes", "quotes checked"],
] as const

/**
 * The live counters (plan §16.8, section 4): real totals, rolling up from zero when they scroll
 * into view (the 21st number ticker, `@shadcnspace/number-ticker-05`, on NumberFlow). The server
 * renders the real numbers; only counters still below the fold are zeroed on mount to roll up.
 * NumberFlow follows prefers-reduced-motion by itself.
 */
export function LiveCounts({ totals }: { totals: LiveTotals }) {
  const ref = useRef<HTMLDListElement>(null)
  const [rolled, setRolled] = useState(true)
  useEffect(() => {
    const el = ref.current
    if (!el || el.getBoundingClientRect().top < window.innerHeight) return
    setRolled(false)
    const io = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setRolled(true)
        io.disconnect()
      }
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <dl ref={ref}>
      {ROWS.map(([key, label]) => (
        <div key={key}>
          <dd>
            <NumberFlow value={rolled ? totals[key] : 0} locales="en" />
          </dd>
          <dt>{label}</dt>
        </div>
      ))}
    </dl>
  )
}

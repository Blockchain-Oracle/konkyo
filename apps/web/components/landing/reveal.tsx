"use client"

import { cn } from "@konkyo/ui/lib/utils"
import { type ElementType, useEffect, useRef, useState } from "react"

/**
 * A headline revealed line by line from behind a mask (plan §8, Dala's): each line rises into
 * view, a beat after the one above, the first time the heading scrolls into view. Without
 * JavaScript, or with reduced motion (the animation becomes a fade), the text simply shows.
 */
export function RevealLines({
  lines,
  as: Tag = "h2",
  className,
  delay = 0,
  immediate = false,
}: {
  lines: string[]
  as?: ElementType
  className?: string
  delay?: number
  /** Above the fold: animate from the first paint (pure CSS), not after the page hydrates. */
  immediate?: boolean
}) {
  const ref = useRef<HTMLElement>(null)
  // "idle" renders plainly (server, no JS); "armed" hides the lines until they're in view.
  const [state, setState] = useState<"idle" | "armed" | "shown">(immediate ? "shown" : "idle")
  useEffect(() => {
    const el = ref.current
    if (!el || immediate) return
    const box = el.getBoundingClientRect()
    // Already on screen when the page loads: it stays as it was painted (no flash and rise).
    if (box.top < window.innerHeight && box.bottom > 0) return
    setState("armed")
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setState("shown")
          observer.disconnect()
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [immediate])
  return (
    <Tag ref={ref} className={className}>
      {lines.map((line, i) => (
        // The extra bottom room keeps descenders inside the mask.
        <span key={line} className="block overflow-hidden pb-[0.1em] -mb-[0.1em]">
          <span
            className={cn(
              "block",
              state === "armed" && "translate-y-[110%]",
              state === "shown" && "animate-line-up",
            )}
            style={state === "shown" ? { animationDelay: `${delay + i * 110}ms` } : undefined}
          >
            {line}
          </span>
        </span>
      ))}
    </Tag>
  )
}

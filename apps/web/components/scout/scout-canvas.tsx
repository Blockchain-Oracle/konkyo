"use client"

import { cn } from "@konkyo/ui/lib/utils"
import { useEffect, useRef } from "react"
import { createScout, type Scout, type ScoutInput } from "@/lib/scout"

/**
 * The scout's black box: the canvas, kept the size of the box, paused while it is off screen, and
 * fed whatever the run is doing. Everything that waits (a deep search, an answer, a comparison,
 * the landing's demo) puts its own input in. Move the pointer over it and the spider comes to
 * see, once it has nothing left to read. A new `epoch` clears the field for a demo that plays
 * again. The look and the walking live in `lib/scout.ts`.
 */
export function ScoutCanvas({
  input,
  epoch = 0,
  className,
  ambient = false,
}: {
  input: ScoutInput
  epoch?: number
  /** Gives the box its height. */
  className?: string
  /** No box: a backdrop that lets everything over it be pressed, and watches the pointer from the window. */
  ambient?: boolean
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const scout = useRef<Scout | null>(null)
  const firstEpoch = useRef(true)

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const made = createScout(el)
    if (!made) return
    scout.current = made
    made.resize()
    const sized = new ResizeObserver(() => made.resize())
    sized.observe(el)
    const seen = new IntersectionObserver(([entry]) => made.play(entry?.isIntersecting ?? true))
    seen.observe(el)
    return () => {
      sized.disconnect()
      seen.disconnect()
      made.destroy()
      scout.current = null
    }
  }, [])

  // Declared before the input's effect, so a new epoch clears the field before its first input.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new epoch is the trigger
  useEffect(() => {
    if (firstEpoch.current) {
      firstEpoch.current = false
      return
    }
    scout.current?.reset()
  }, [epoch])

  useEffect(() => {
    scout.current?.set(input)
  }, [input])

  // A backdrop sits under the page's own content, so it hears the pointer from the window.
  useEffect(() => {
    const el = canvas.current
    if (!ambient || !el) return
    const move = (e: PointerEvent) => {
      const box = el.getBoundingClientRect()
      const inside =
        e.clientX >= box.left &&
        e.clientX <= box.right &&
        e.clientY >= box.top &&
        e.clientY <= box.bottom
      scout.current?.pointer(inside ? e.clientX - box.left : null, e.clientY - box.top)
    }
    window.addEventListener("pointermove", move)
    return () => window.removeEventListener("pointermove", move)
  }, [ambient])

  return (
    <div
      className={cn(
        ambient
          ? "pointer-events-none relative"
          : "relative overflow-hidden rounded-card border border-border bg-sticker",
        className,
      )}
      onPointerMove={(e) => {
        if (ambient) return
        const box = e.currentTarget.getBoundingClientRect()
        scout.current?.pointer(e.clientX - box.left, e.clientY - box.top)
      }}
      onPointerLeave={() => scout.current?.pointer(null)}
    >
      <canvas ref={canvas} aria-hidden className="absolute inset-0 size-full font-mono" />
    </div>
  )
}

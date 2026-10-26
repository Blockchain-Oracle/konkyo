import type { SpaceColor, SpaceWall } from "@konkyo/config"
import { spaceStyle, tiltFor, wallClass } from "@konkyo/ui/lib/space"
import { cn } from "@konkyo/ui/lib/utils"
import type * as React from "react"

/**
 * Konkyo's house objects (plan §16.4) as components: black sticker
 * pills for chrome, paper objects pinned on walls, reply slips, outlined "knows" cards, and the
 * coloured wall a space lives on. Styles live in tokens.css (`@layer components`).
 */

/** Black chrome pill. `tilt` gives one or two of them personality (never a whole row). */
export function StickerPill({
  className,
  tilt,
  style,
  ...props
}: React.ComponentProps<"span"> & { tilt?: number }) {
  return (
    <span
      data-slot="sticker-pill"
      className={cn("sticker-pill", className)}
      style={tilt ? { rotate: `${tilt}deg`, ...style } : style}
      {...props}
    />
  )
}

/** A paper object on a wall: flat, tilted by its id (the same on every screen), lifts on hover. */
export function PaperCard({
  id,
  width,
  className,
  style,
  straight,
  ...props
}: React.ComponentProps<"div"> & { id?: string; width?: number; straight?: boolean }) {
  const tilt = !straight && id ? tiltFor(id, width) : undefined
  return (
    <div
      data-slot="paper-card"
      className={cn("paper-card", className)}
      style={tilt ? ({ "--tilt": tilt, ...style } as React.CSSProperties) : style}
      {...props}
    />
  )
}

/** Tone of a slip's tab: what the reply is. */
export type SlipTone = "knows" | "cant" | "asking"

const TAB_TONE: Record<SlipTone, string> = {
  knows: "bg-lime",
  cant: "bg-orange",
  asking: "bg-ink text-white",
}

/** The reply slip: cream, ink border, offset ink shadow, a toned tab. */
export function Slip({
  tab,
  tone = "knows",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { tab?: React.ReactNode; tone?: SlipTone }) {
  return (
    <div
      data-slot="slip"
      className={cn("say-slip animate-slip-in px-7 pt-7 pb-5", className)}
      {...props}
    >
      {tab ? <span className={cn("slip-tab", TAB_TONE[tone])}>{tab}</span> : null}
      {children}
    </div>
  )
}

/** The "what it knows" object: thick ink outline, offset ink shadow, cream. */
export function BrutalCard({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="brutal-card" className={cn("brutal-card p-5", className)} {...props} />
}

/** A strip of kraft tape for polaroids and slips. */
export function Tape({ className, ...props }: React.ComponentProps<"span">) {
  return <span aria-hidden data-slot="tape" className={cn("tape", className)} {...props} />
}

/** The wall a space lives on: its preset colour, its accent variables, and the faint pegboard. */
export function Wall({
  color,
  wall,
  grid = true,
  className,
  style,
  ...props
}: React.ComponentProps<"div"> & { color: SpaceColor; wall?: SpaceWall; grid?: boolean }) {
  return (
    <div
      data-slot="wall"
      className={cn(wallClass(color, wall), grid && "wall-grid", className)}
      style={{ ...spaceStyle(color, wall), ...style }}
      {...props}
    />
  )
}

/** Small lowercase kicker above a title ("ongoing · your people, in one place"). */
export function Kicker({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-kicker text-room-muted", className)} {...props} />
}

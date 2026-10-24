import { MOTION, SPACES, type SpaceColor, type SpaceWall } from "@konkyo/config"
import type { CSSProperties } from "react"

/** Black or white text on a colour (OurSpaces readableInk: YIQ luminance cutoff). */
export function readableInk(hex: string): "#111114" | "#ffffff" {
  const h = hex.replace("#", "")
  if (!/^[0-9a-f]{6}$/i.test(h)) return "#111114"
  const channel = (i: number) => Number.parseInt(h.slice(i, i + 2), 16)
  const luminance = (0.299 * channel(0) + 0.587 * channel(2) + 0.114 * channel(4)) / 255
  return luminance > SPACES.inkCutoff ? "#111114" : "#ffffff"
}

/** A stable colour for anything without one yet (hashed from its id). */
export function colorFor(id: string): SpaceColor {
  const keys = Object.keys(SPACES.colors) as SpaceColor[]
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return keys[Math.abs(hash) % keys.length] ?? "violet"
}

/**
 * A small deterministic tilt, the same on every screen (OurSpaces WidgetCard): -2..2 steps of 1.1°,
 * damped on wide cards; a fifth of cards stay straight.
 */
export function tiltFor(id: string, width = 240): string | undefined {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  const step = (Math.abs(hash) % 5) - 2
  if (step === 0) return undefined
  const damp = Math.min(1, Math.max(0.4, MOTION.tiltWidth / width))
  return `${(step * MOTION.tiltStep * damp).toFixed(2)}deg`
}

/** The CSS variables a space's wall and objects read: accent, its ink, and the wall preset. */
export function spaceStyle(color: SpaceColor, wall?: SpaceWall): CSSProperties {
  const accent = SPACES.colors[color].hex
  const preset = SPACES.walls[wall ?? (SPACES.defaultWall[color] as SpaceWall)]
  return {
    "--space-accent": accent,
    "--space-accent-ink": readableInk(accent),
    "--space-accent-text": SPACES.colors[color].text,
    "--space-heading-color": preset.ink,
  } as CSSProperties
}

/** The wall class for a space (`wall wall-<preset>`). */
export function wallClass(color: SpaceColor, wall?: SpaceWall) {
  return `wall wall-${wall ?? SPACES.defaultWall[color]}`
}

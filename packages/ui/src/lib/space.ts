import { MOTION, SPACES, type SpaceColor, type SpaceWall } from "@konkyo/config"
import type { CSSProperties } from "react"

const linear = (v: number) => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance of a #rrggbb colour. */
export function luminance(hex: string) {
  const h = hex.replace("#", "")
  if (!/^[0-9a-f]{6}$/i.test(h)) return 0
  const [r, g, b] = [0, 2, 4].map((i) => linear(Number.parseInt(h.slice(i, i + 2), 16)))
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}

/** WCAG contrast ratio between two #rrggbb colours (1–21). */
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/**
 * Black or white text on a colour, whichever measures higher. OurSpaces used a YIQ cutoff, which
 * puts white on cobalt (4.2:1) and pink (3.8:1); measuring picks ink there (4.7 and 4.9).
 */
export function readableInk(hex: string): "#0b0b0e" | "#ffffff" {
  return contrast(hex, "#0b0b0e") >= contrast(hex, "#ffffff") ? "#0b0b0e" : "#ffffff"
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

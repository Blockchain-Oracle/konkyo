/** State glyphs for the kit (the app's own verdict glyphs live with the chips). */
export { CheckIcon, CircleDashedIcon, CircleHelpIcon, XIcon } from "lucide-react"

/** Partly: a half-filled circle, never colour alone. */
export function HalfIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" />
    </svg>
  )
}

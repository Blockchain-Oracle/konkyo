import { APP } from "@konkyo/config"
import { MarkShapes } from "@/components/brand-mark"

/** The mark (木) for OG images: `BrandMark`'s small cut, lime unless told otherwise. */
export function Mark({ size: px, fill = "#c9ff3d" }: { size: number; fill?: string }) {
  return (
    <svg width={px} height={px} viewBox="0 0 64 64" role="img" aria-label={APP.name}>
      {/* Satori takes only plain elements inside <svg>: the shapes are called, not rendered */}
      <g fill={fill}>{MarkShapes({ small: true })}</g>
    </svg>
  )
}

/** A check mark for OG images (the font's Latin subset has no ✓). */
export function Tick({ size: px, color }: { size: number; color: string }) {
  return (
    <svg width={px} height={px} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 12.5l5 5L20 6.5"
        fill="none"
        stroke={color}
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** The four-point spark that marks a space in OG images (no ✦ in the font either). */
export function Spark({ size: px, color }: { size: number; color: string }) {
  return (
    <svg width={px} height={px} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 1.5c.6 5.6 4.9 9.9 10.5 10.5-5.6.6-9.9 4.9-10.5 10.5C11.4 16.9 7.1 12.6 1.5 12 7.1 11.4 11.4 7.1 12 1.5z"
        fill={color}
      />
    </svg>
  )
}

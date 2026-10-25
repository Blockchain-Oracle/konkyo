import { APP } from "@konkyo/config"

/** The mark (木) for OG images: lime, as in `app/icon.svg` and `BrandMark`. */
export function Mark({ size: px, fill = "#c9ff3d" }: { size: number; fill?: string }) {
  return (
    <svg width={px} height={px} viewBox="0 0 64 64" role="img" aria-label={APP.name}>
      <g fill={fill}>
        <rect x="4" y="15" width="56" height="9" />
        <rect x="27.5" y="3" width="9" height="57" />
        <polygon points="24,29 24,36 10,60 0,60" />
        <polygon points="40,29 40,36 54,60 64,60" />
      </g>
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

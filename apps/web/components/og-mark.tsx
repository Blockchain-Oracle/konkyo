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

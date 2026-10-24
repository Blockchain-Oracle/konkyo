import { APP } from "@konkyo/config"

/** The mark (木), as in `app/icon.svg`, in Dala's violet-to-verdant gradient. */
export function Mark({ size: px }: { size: number }) {
  return (
    <svg width={px} height={px} viewBox="0 0 64 64" role="img" aria-label={APP.name}>
      <defs>
        <linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="4" x2="0" y2="60">
          <stop offset="0" stopColor="#8052ff" />
          <stop offset="1" stopColor="#15846e" />
        </linearGradient>
      </defs>
      <g fill="url(#g)">
        <rect x="4" y="15" width="56" height="9" />
        <rect x="27.5" y="3" width="9" height="57" />
        <polygon points="24,29 24,36 10,60 0,60" />
        <polygon points="40,29 40,36 54,60 64,60" />
      </g>
    </svg>
  )
}

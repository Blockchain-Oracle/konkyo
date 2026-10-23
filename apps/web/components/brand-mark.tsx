import { useId } from "react"

/**
 * The Konkyo mark: 木, the "tree/root" radical of 根 (the first character of 根拠, "grounds"),
 * in Dala's logo gradient. Inline so it inherits sizing and needs no request.
 * `small` uses heavier strokes that stay legible at 16–24px.
 */
export function BrandMark({ className, small = false }: { className?: string; small?: boolean }) {
  const id = useId()
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="4" x2="0" y2="60">
          <stop offset="0" stopColor="#8052ff" />
          <stop offset="1" stopColor="#15846e" />
        </linearGradient>
      </defs>
      <g fill={`url(#${id})`}>
        {small ? (
          <>
            <rect x="4" y="15" width="56" height="9" />
            <rect x="27.5" y="3" width="9" height="57" />
            <polygon points="24,29 24,36 10,60 0,60" />
            <polygon points="40,29 40,36 54,60 64,60" />
          </>
        ) : (
          <>
            <rect x="6" y="18" width="52" height="6" />
            <rect x="29" y="5" width="6" height="53" />
            <polygon points="26,28 26,33 8,58 1,58" />
            <polygon points="38,28 38,33 56,58 63,58" />
          </>
        )}
      </g>
    </svg>
  )
}

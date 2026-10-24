"use client"

import { useId } from "react"

/** The Konkyo mark (木) and name, as in the app. */
export function Brand() {
  // One id per copy: the nav renders twice, and a gradient inside the hidden copy never paints.
  const id = useId()
  return (
    <span className="inline-flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
      <svg viewBox="0 0 64 64" className="size-5" aria-hidden>
        <defs>
          <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="4" x2="0" y2="60">
            <stop offset="0" stopColor="#8052ff" />
            <stop offset="1" stopColor="#15846e" />
          </linearGradient>
        </defs>
        <g fill={`url(#${id})`}>
          <rect x="4" y="15" width="56" height="9" />
          <rect x="27.5" y="3" width="9" height="57" />
          <polygon points="24,29 24,36 10,60 0,60" />
          <polygon points="40,29 40,36 54,60 64,60" />
        </g>
      </svg>
      Konkyo docs
    </span>
  )
}

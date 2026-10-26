"use client"

/*
 * A person's face: a look, a photo, or the initial on a colour.
 */

import { type CSSProperties, useState } from "react"
import type { Face } from "@/lib/profiles"

export type { Face }

/** A person: their picture if there is one (and it loads), else their initial on their colour. */
export function MemberFace({
  face,
  size = "md",
  className = "",
  style,
}: {
  face: Face
  size?: "xs" | "sm" | "md" | "lg"
  className?: string
  style?: CSSProperties
}) {
  // the address that failed to load, so a new picture gets its own try
  const [failed, setFailed] = useState<string | null>(null)
  const src = face.src && face.src !== failed ? face.src : null
  return (
    <span
      role="img"
      aria-label={face.name}
      className={`member-face member-face-${size} ${src ? "" : "identity-chip initial-chip"} ${className}`}
      style={{
        ...(src
          ? undefined
          : {
              backgroundColor: face.color,
              color: "white",
              textShadow: "none",
              fontWeight: 800,
              fontFamily: "var(--font-display)",
            }),
        ...style,
      }}
    >
      {src ? (
        // biome-ignore lint/performance/noImgElement: a small face (a look, a photo, Google's)
        <img
          className="member-face-img"
          src={src}
          alt=""
          draggable={false}
          referrerPolicy="no-referrer"
          onError={() => setFailed(src)}
        />
      ) : (
        face.name.trim().slice(0, 1).toUpperCase() || "?"
      )}
    </span>
  )
}

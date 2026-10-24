"use client"

/*
 * Ported from OurSpaces (https://github.com/thomasnguyen/ourspaces-app, src/components/LookRow.tsx),
 * MIT licence, Copyright (c) 2026 Thomas Nguyen. Twelve looks here instead of their eight.
 */

import { LOOKS, SPACES } from "@konkyo/config"
import type { CSSProperties } from "react"
import { MemberFace } from "./member-face"

export type Look = (typeof LOOKS)[number]

/**
 * The looks, one tap each: shared by the enter card and the settings card. `onPhoto` adds a
 * thirteenth tile, your own photo (or the dashed slot to add one).
 */
export function LookRow({
  selected,
  photo,
  name,
  onPick,
  onPhoto,
}: {
  /** The look showing now, or "photo" when your photo is your face. */
  selected: Look["id"] | "photo" | null
  /** Your photo's address, if you have one. */
  photo?: string | null
  name: string
  onPick: (look: Look) => void
  onPhoto?: () => void
}) {
  return (
    <div className="claim-look-row">
      {LOOKS.map((look) => {
        const on = selected === look.id
        const color = SPACES.colors[look.color].hex
        return (
          <button
            key={look.id}
            type="button"
            className={`claim-look${on ? " is-selected" : ""}`}
            style={{ "--look": color } as CSSProperties}
            onClick={() => onPick(look)}
            title={look.name}
            aria-label={`look: ${look.name}`}
            aria-pressed={on}
          >
            <MemberFace
              face={{ name: look.name, src: `/looks/${look.id}.webp`, color }}
              size="md"
            />
            {on && <YouBadge />}
          </button>
        )
      })}
      {onPhoto && (
        <button
          type="button"
          className={`claim-look claim-look-photo${photo ? " has-photo" : ""}${selected === "photo" ? " is-selected" : ""}`}
          onClick={onPhoto}
          title={photo ? "change your photo" : "use my photo"}
          aria-label={photo ? "change your photo" : "use my photo"}
          aria-pressed={selected === "photo"}
        >
          {photo ? (
            <MemberFace face={{ name, src: photo, color: "#0b0b0e" }} size="md" />
          ) : (
            <span className="claim-look-photo-slot">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path
                  d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.2-2h5.4l1.2 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
                <circle
                  cx="12"
                  cy="12.5"
                  r="3.2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
              </svg>
              <small>my photo</small>
            </span>
          )}
          {selected === "photo" && <YouBadge />}
        </button>
      )}
    </div>
  )
}

function YouBadge() {
  return (
    <span className="claim-look-selected">
      <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
        <path
          d="m2 6 2.5 2.5L10 3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      you
    </span>
  )
}

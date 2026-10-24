"use client"

import { useEffect, useState } from "react"

export const SECTIONS = [
  { id: "you", label: "you" },
  { id: "sounds", label: "sounds & voice" },
  { id: "connectors", label: "connectors" },
  { id: "citations", label: "citations" },
  { id: "deep-search", label: "deep search" },
  { id: "notifications", label: "notifications" },
  { id: "study", label: "study" },
  { id: "memory", label: "memory" },
  { id: "api-keys", label: "API keys" },
  { id: "usage", label: "usage" },
  { id: "leave", label: "sign out & delete" },
] as const

/** Settings' section nav: sticker pills, the one you're reading lit (lime), a chip row on phones. */
export function SettingsNav() {
  const [here, setHere] = useState<string>(SECTIONS[0].id)
  useEffect(() => {
    const seen = new Map<string, boolean>()
    const watch = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) seen.set(entry.target.id, entry.isIntersecting)
        const first = SECTIONS.find((s) => seen.get(s.id))
        if (first) setHere(first.id)
      },
      { rootMargin: "-20% 0px -55% 0px" },
    )
    for (const { id } of SECTIONS) {
      const el = document.getElementById(id)
      if (el) watch.observe(el)
    }
    return () => watch.disconnect()
  }, [])
  return (
    <nav className="settings-nav" aria-label="Settings sections">
      {SECTIONS.map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          className={here === section.id ? "is-here" : undefined}
          aria-current={here === section.id ? "location" : undefined}
        >
          {section.label}
        </a>
      ))}
    </nav>
  )
}

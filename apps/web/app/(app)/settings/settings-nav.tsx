"use client"

import { cn } from "@konkyo/ui/lib/utils"
import { useEffect, useState } from "react"
import { SETTINGS_GROUPS, SETTINGS_SECTIONS } from "./settings-sections"

/**
 * Settings' section nav: one black sticker with the sections in their four groups, the one
 * you're reading lit lime. On phones it is a row of chips that scrolls sideways.
 */
export function SettingsNav() {
  const [here, setHere] = useState<string>(SETTINGS_SECTIONS[0]?.id ?? "")
  useEffect(() => {
    const seen = new Map<string, boolean>()
    const watch = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) seen.set(entry.target.id, entry.isIntersecting)
        const first = SETTINGS_SECTIONS.find((s) => seen.get(s.id))
        if (first) setHere(first.id)
      },
      { rootMargin: "-20% 0px -55% 0px" },
    )
    for (const { id } of SETTINGS_SECTIONS) {
      const el = document.getElementById(id)
      if (el) watch.observe(el)
    }
    return () => watch.disconnect()
  }, [])
  return (
    <nav
      aria-label="Settings sections"
      className="sticky top-4 z-20 -mx-4 flex gap-1 overflow-x-auto bg-transparent px-4 pb-2 [scrollbar-width:none] md:top-[92px] md:mx-0 md:flex-col md:gap-0 md:overflow-visible md:rounded-card md:bg-sticker md:p-2.5 md:shadow-[0_8px_0_rgb(17_17_20/0.2)]"
    >
      {SETTINGS_GROUPS.map((group, g) => (
        <div key={group.label} className="flex gap-1 md:flex-col">
          <p
            className={cn(
              "hidden px-3 pt-3 pb-1.5 text-micro tracking-[0.08em] text-ash-gray uppercase md:block",
              g === 0 && "pt-1.5",
            )}
          >
            {group.label}
          </p>
          {group.sections.map(({ id, label, icon: Icon }) => {
            const active = here === id
            return (
              <a
                key={id}
                href={`#${id}`}
                aria-current={active ? "location" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-full px-3.5 py-2 text-snippet font-semibold whitespace-nowrap transition-colors duration-(--duration-press) md:rounded-xl md:py-2",
                  active
                    ? "bg-lime text-ink"
                    : "bg-sticker text-room-soft hover:bg-white/8 hover:text-white",
                )}
              >
                <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                {label}
              </a>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

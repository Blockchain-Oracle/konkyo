"use client"

import { cn } from "@konkyo/ui/lib/utils"
import type { Route } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"
import { isActive, MAIN_NAV, MOBILE_TABS } from "@/lib/navigation"
import { usePreview } from "@/lib/preview"
import { sound } from "@/lib/sounds"
import { useUnread } from "@/lib/use-inbox"
import { useCurrentSpaceId } from "./rail"

/**
 * The places: words in one dark sticker group, top right (OurSpaces' header group "here now · +
 * add · ↗ invite"), never an icon rail. The rail holds only your spaces, as in OurSpaces.
 */
export function PlacesBar() {
  const pathname = usePathname()
  const space = useCurrentSpaceId()
  const { data: unread } = useUnread()
  // A source docked beside the page owns the top right (its tabs and tools); the rail and ⌘K
  // still go everywhere.
  const { active: sourceOpen } = usePreview()
  // On a phone the bar scrolls: the place you're in is kept in view.
  const bar = useRef<HTMLElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-runs when the place changes
  useEffect(() => {
    bar.current
      ?.querySelector<HTMLElement>("[aria-current=page]")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [pathname])
  return (
    <nav
      ref={bar}
      aria-label="Places"
      className={cn(
        sourceOpen && "lg:hidden",
        "places-bar fixed top-5 right-6 z-[45] flex max-w-[calc(100vw-140px)] items-center gap-0.5 overflow-x-auto rounded-full bg-sticker p-1.5 shadow-[0_7px_0_rgba(45,22,31,0.22)] [scrollbar-width:none] max-[800px]:top-3 max-[800px]:right-3 max-[800px]:left-3 max-[800px]:max-w-none max-[800px]:mask-[linear-gradient(to_right,black_82%,transparent)] max-[800px]:pr-8",
      )}
    >
      {MAIN_NAV.map((item) => {
        // Inside a space, the space's tile is "you are here", not Library.
        const active = item.href === "/library" && space ? false : isActive(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href as Route}
            onClick={() => sound("tap")}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-[12px] font-extrabold whitespace-nowrap text-white/70 transition-[translate,color,background-color] duration-(--dur-quick) ease-(--ease-glide) hover:-translate-y-0.5 hover:text-white",
              active && "bg-white text-ink hover:text-ink",
              // phones: the five most used first, so the inbox and its count are in view
              !MOBILE_TABS.includes(item.href as (typeof MOBILE_TABS)[number]) &&
                "max-[800px]:order-last",
            )}
          >
            {item.label.toLowerCase()}
            {item.href === "/inbox" && unread ? (
              <span className="ml-1.5 grid min-w-4.5 place-items-center rounded-full bg-lime px-1 text-[10px] leading-4.5 text-ink tabular-nums">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}

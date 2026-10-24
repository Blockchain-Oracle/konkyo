"use client"

import { usePathname } from "next/navigation"
import { useEffect } from "react"
import { useSpaceList } from "@/lib/use-spaces"
import { useCurrentSpaceId } from "./rail"

/**
 * Every page lives on a wall, as every OurSpaces room does (their .paper-bg + space-theme-*
 * classes, ported in house.css). A space's page takes its own wall; each place takes one that
 * stands off the black chrome (3:1 or more against it), so the rail, dock and places bar never
 * sink into the room. Words sit on paper or stickers on top (tokens.css, "visibility").
 */
const PLACE_WALL: [RegExp, string][] = [
  [/^\/home/, "blush"],
  [/^\/library/, "cobalt"],
  [/^\/chats/, "violet"],
  [/^\/study/, "mint"],
  [/^\/write/, "butter"],
  [/^\/agents/, "lagoon"],
  [/^\/inbox/, "blush"],
  [/^\/briefs/, "violet"],
]
/** Walls the black chrome would sink into; it takes a light rim on these. */
const DARK_WALLS = new Set(["spruce", "nightwall", "midnight"])

export function WallBackground({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const spaceId = useCurrentSpaceId()
  const { data: spaces } = useSpaceList()
  const space = spaceId ? spaces?.find((s) => s.id === spaceId) : undefined
  const wall = space?.wall ?? PLACE_WALL.find(([re]) => re.test(pathname))?.[1] ?? "white"
  const theme = wall === "night" ? "nightwall" : wall === "clean" ? "white" : wall

  useEffect(() => {
    document.documentElement.dataset.wallTone = DARK_WALLS.has(theme) ? "dark" : "light"
  }, [theme])

  return <div className={`paper-bg space-theme-${theme} min-h-svh`}>{children}</div>
}

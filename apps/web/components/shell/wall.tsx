"use client"

import { usePathname } from "next/navigation"
import { useEffect, useSyncExternalStore } from "react"
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
/** A page can pick its own wall (a study round plays on its game's colour); null gives it back. */
let override: string | null = null
const listeners = new Set<() => void>()
export function setRoomWall(wall: string | null) {
  override = wall
  for (const l of listeners) l()
}
/** Sets this page's wall while it's shown. */
export function useRoomWall(wall: string | null) {
  useEffect(() => {
    setRoomWall(wall)
    return () => setRoomWall(null)
  }, [wall])
}
function useOverride() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => override,
    () => null,
  )
}

/** The CSS theme a wall preset paints with (two presets go by other class names). */
export const wallTheme = (wall: string) =>
  wall === "night" ? "nightwall" : wall === "clean" ? "white" : wall

/** Walls the black chrome would sink into; it takes a light rim on these. */
const DARK_WALLS = new Set(["spruce", "nightwall", "midnight"])

export function WallBackground({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const spaceId = useCurrentSpaceId()
  const { data: spaces } = useSpaceList()
  const space = spaceId ? spaces?.find((s) => s.id === spaceId) : undefined
  const chosen = useOverride()
  const wall = chosen ?? space?.wall ?? PLACE_WALL.find(([re]) => re.test(pathname))?.[1] ?? "white"
  const theme = wallTheme(wall)

  useEffect(() => {
    document.documentElement.dataset.wallTone = DARK_WALLS.has(theme) ? "dark" : "light"
  }, [theme])

  return <div className={`paper-bg space-theme-${theme} min-h-svh`}>{children}</div>
}

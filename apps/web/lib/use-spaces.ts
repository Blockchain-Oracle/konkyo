"use client"

import { useQuery } from "@/lib/use-query"
import { api } from "./fetcher"
import { qk } from "./query-keys"
import type { SpaceRow } from "./spaces"

export type { SpaceRow }

/** Your spaces (top-level folders) with colour, wall, glyph and real cover photos. */
export function useSpaceList() {
  return useQuery({
    queryKey: qk.spaces.list(),
    queryFn: () => api<{ spaces: SpaceRow[] }>("/api/spaces").then((r) => r.spaces),
  })
}

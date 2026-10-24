"use client"

import { useQuery } from "@/lib/use-query"
import { api } from "./fetcher"
import type { LiveStatus } from "./status"

/** The live pill's numbers: polled quickly while something is being read, slowly otherwise. */
export function useLiveStatus() {
  return useQuery({
    queryKey: ["status"],
    queryFn: () => api<LiveStatus>("/api/status"),
    refetchInterval: (query) => {
      const data = query.state.data
      return data && (data.reading > 0 || data.working > 0) ? 4_000 : 60_000
    },
  })
}

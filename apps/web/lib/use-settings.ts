"use client"

import { type QueryKey, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "./fetcher"
import type { Settings } from "./settings"

export type { Settings }

const key = ["settings"] as const

/**
 * The person's settings, and a save that shows the change at once and rolls it back if the
 * server refuses. `alsoRefresh` names queries that read a setting (Today's review reads dailyNew).
 */
export function useSettings({ alsoRefresh = [] }: { alsoRefresh?: QueryKey[] } = {}) {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: key, queryFn: () => api<Settings>("/api/settings") })
  const save = useMutation({
    mutationFn: (patch: Partial<Settings>) =>
      api<Settings>("/api/settings", { method: "PATCH", json: patch }),
    onMutate: (patch) => {
      const previous = queryClient.getQueryData<Settings>(key)
      if (previous) queryClient.setQueryData<Settings>(key, { ...previous, ...patch })
      return { previous }
    },
    onError: (error: Error, _patch, context) => {
      queryClient.setQueryData(key, context?.previous)
      toast.error(error.message)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key })
      for (const other of alsoRefresh) void queryClient.invalidateQueries({ queryKey: other })
    },
  })
  return { settings: data, save }
}

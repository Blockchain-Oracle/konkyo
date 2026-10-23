"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "./fetcher"
import type { Focus } from "./focus"

/** Suggested questions for a focus (plan F16); the same focus asks the server once. */
export function useSuggestions(focus: Focus, enabled = true) {
  const fileIds = [...focus.fileIds].sort()
  const folderIds = [...focus.folderIds].sort()
  return useQuery({
    queryKey: ["suggest", fileIds, folderIds],
    queryFn: () =>
      api<{ questions: string[] }>("/api/suggest", {
        method: "POST",
        json: { fileIds, folderIds },
      }).then((r) => r.questions),
    staleTime: 10 * 60_000,
    enabled,
  })
}

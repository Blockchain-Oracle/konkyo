"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useQuery } from "@/lib/use-query"
import { api } from "./fetcher"

export type BriefSummary = {
  id: string
  title: string
  status: "making" | "ready" | "failed"
  durationSeconds: number | null
  createdAt: string
}

export const briefKeys = { folder: (id: string) => ["briefs", "folder", id] as const }

/** A folder's audio briefs, newest first; refreshed while one is being made. */
export function useFolderBriefs(folderId: string) {
  return useQuery({
    queryKey: briefKeys.folder(folderId),
    queryFn: () =>
      api<{ briefs: BriefSummary[] }>(`/api/briefs?folder=${folderId}`).then((r) => r.briefs),
    refetchInterval: (query) =>
      query.state.data?.some((b) => b.status === "making") ? 3_000 : false,
  })
}

/** Make an audio brief of a folder, then open its page (progress shows there). */
export function useMakeBrief() {
  const router = useRouter()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (folderId: string) =>
      api<{ id: string }>("/api/briefs", { method: "POST", json: { folderId } }),
    onSuccess: ({ id }, folderId) => {
      void queryClient.invalidateQueries({ queryKey: briefKeys.folder(folderId) })
      void queryClient.invalidateQueries({ queryKey: ["briefs"] })
      router.push(`/briefs/${id}` as Route)
    },
    onError: (error: Error) => toast.error(error.message),
  })
}

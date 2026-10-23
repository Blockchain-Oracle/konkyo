"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "./fetcher"
import type { Highlight } from "./highlights"
import { qk } from "./query-keys"
import { useSourceAccess } from "./source-access"

export type { Highlight }

type Box = [number, number, number, number]

/** The owner's highlights; a public folder's visitors see none. */
export function useHighlights(fileId: string) {
  const { owner } = useSourceAccess()
  return useQuery({
    queryKey: qk.highlights(fileId),
    queryFn: () =>
      api<{ highlights: Highlight[] }>(`/api/files/${fileId}/highlights`).then((r) => r.highlights),
    enabled: owner,
  })
}

export function useHighlightActions(fileId: string) {
  const queryClient = useQueryClient()
  const key = qk.highlights(fileId)
  const refresh = () => queryClient.invalidateQueries({ queryKey: key })
  // Optimistic: the mark appears the moment Highlight is pressed.
  const add = useMutation({
    mutationFn: (marks: { page: number; rects: Box[]; text: string }[]) =>
      api(`/api/files/${fileId}/highlights`, { method: "POST", json: { marks } }),
    onMutate: async (marks) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Highlight[]>(key)
      queryClient.setQueryData<Highlight[]>(key, (old) => [
        ...(old ?? []),
        ...marks.map((m, i) => ({
          id: `pending-${Date.now()}-${i}`,
          ...m,
          createdAt: new Date(),
        })),
      ])
      return { previous }
    },
    onError: (error: Error, _m, context) => {
      queryClient.setQueryData(key, context?.previous)
      toast.error(error.message)
    },
    onSettled: refresh,
  })
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/highlights/${id}`, { method: "DELETE" }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Highlight[]>(key)
      queryClient.setQueryData<Highlight[]>(key, (old) => old?.filter((h) => h.id !== id))
      return { previous }
    },
    onError: (error: Error, _id, context) => {
      queryClient.setQueryData(key, context?.previous)
      toast.error(error.message)
    },
    onSettled: refresh,
  })
  return { add, remove }
}

"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useQuery } from "@/lib/use-query"
import { api } from "./fetcher"
import { qk } from "./query-keys"
import type { TrashItem } from "./trash"

export type { TrashItem }

export function useTrash() {
  return useQuery({
    queryKey: qk.trash,
    queryFn: () => api<{ items: TrashItem[] }>("/api/trash").then((r) => r.items),
  })
}

export function useTrashActions() {
  const queryClient = useQueryClient()
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.trash }),
      queryClient.invalidateQueries({ queryKey: qk.files.all }),
      queryClient.invalidateQueries({ queryKey: qk.folders.all }),
    ])
  const onError = (error: Error) => toast.error(error.message)
  // Optimistic: the row leaves Trash at once.
  const drop = async (batch?: string) => {
    await queryClient.cancelQueries({ queryKey: qk.trash })
    const previous = queryClient.getQueryData<TrashItem[]>(qk.trash)
    queryClient.setQueryData<TrashItem[]>(qk.trash, (old) =>
      batch ? old?.filter((i) => i.batch !== batch) : [],
    )
    return { previous }
  }

  const restore = useMutation({
    mutationFn: ({ batch }: { batch: string; name: string }) =>
      api(`/api/trash/${batch}`, { method: "POST" }),
    onMutate: ({ batch }) => drop(batch),
    onSuccess: (_r, { name }) => toast.success(`Restored “${name}”`),
    onError: (error, _v, context) => {
      queryClient.setQueryData(qk.trash, context?.previous)
      onError(error)
    },
    onSettled: refresh,
  })
  const deleteForever = useMutation({
    mutationFn: (batch: string) => api(`/api/trash/${batch}`, { method: "DELETE" }),
    onMutate: (batch) => drop(batch),
    onError: (error, _v, context) => {
      queryClient.setQueryData(qk.trash, context?.previous)
      onError(error)
    },
    onSettled: refresh,
  })
  const empty = useMutation({
    mutationFn: () => api("/api/trash", { method: "DELETE" }),
    onMutate: () => drop(),
    onSuccess: () => toast.success("Trash is empty"),
    onError: (error, _v, context) => {
      queryClient.setQueryData(qk.trash, context?.previous)
      onError(error)
    },
    onSettled: refresh,
  })
  return { restore, deleteForever, empty }
}

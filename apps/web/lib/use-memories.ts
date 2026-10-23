"use client"

import type { MemoryItem } from "@konkyo/agents"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "./fetcher"
import { qk } from "./query-keys"

export type { MemoryItem }

export function useMemories() {
  return useQuery({
    queryKey: qk.memories,
    queryFn: () => api<{ memories: MemoryItem[] }>("/api/memories").then((r) => r.memories),
  })
}

/** Edit, forget, forget all (plan F33); each shows at once and rolls back if the server says no. */
export function useMemoryActions() {
  const queryClient = useQueryClient()
  const patch = async (fn: (all: MemoryItem[]) => MemoryItem[]) => {
    await queryClient.cancelQueries({ queryKey: qk.memories })
    const previous = queryClient.getQueryData<MemoryItem[]>(qk.memories)
    queryClient.setQueryData<MemoryItem[]>(qk.memories, (old) => (old ? fn(old) : old))
    return { previous }
  }
  const rollback = (error: Error, _v: unknown, context?: { previous?: MemoryItem[] }) => {
    queryClient.setQueryData(qk.memories, context?.previous)
    toast.error(error.message)
  }
  const settle = () => queryClient.invalidateQueries({ queryKey: qk.memories })

  const edit = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      api(`/api/memories/${id}`, { method: "PATCH", json: { content } }),
    onMutate: ({ id, content }) =>
      patch((all) => all.map((m) => (m.id === id ? { ...m, content } : m))),
    onError: rollback,
    onSettled: settle,
  })
  const forget = useMutation({
    mutationFn: ({ id }: { id: string }) => api(`/api/memories/${id}`, { method: "DELETE" }),
    onMutate: ({ id }) => patch((all) => all.filter((m) => m.id !== id)),
    onSuccess: () => toast.success("Forgotten"),
    onError: rollback,
    onSettled: settle,
  })
  const forgetAll = useMutation({
    mutationFn: () => api("/api/memories", { method: "DELETE" }),
    onMutate: () => patch(() => []),
    onSuccess: () => toast.success("Konkyo's memory is empty"),
    onError: rollback,
    onSettled: settle,
  })
  return { edit, forget, forgetAll }
}

"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useQuery } from "@/lib/use-query"
import { api } from "./fetcher"

export type ChatListItem = { id: string; title: string; pinnedAt: string | null; updatedAt: string }

export const chatsKey = ["chats"] as const

export function useChats() {
  return useQuery({
    queryKey: chatsKey,
    queryFn: () => api<{ chats: ChatListItem[] }>("/api/chats").then((r) => r.chats),
  })
}

/** Rename, pin and delete (plan F17); each shows at once and rolls back if the server says no. */
export function useChatActions() {
  const queryClient = useQueryClient()
  const patch = async (fn: (chats: ChatListItem[]) => ChatListItem[]) => {
    await queryClient.cancelQueries({ queryKey: chatsKey })
    const previous = queryClient.getQueryData<ChatListItem[]>(chatsKey)
    queryClient.setQueryData<ChatListItem[]>(chatsKey, (old) => (old ? fn(old) : old))
    return { previous }
  }
  const rollback = (error: Error, _v: unknown, context?: { previous?: ChatListItem[] }) => {
    queryClient.setQueryData(chatsKey, context?.previous)
    toast.error(error.message)
  }
  const settle = () => queryClient.invalidateQueries({ queryKey: chatsKey })

  const rename = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api(`/api/chats/${id}`, { method: "PATCH", json: { title } }),
    onMutate: ({ id, title }) =>
      patch((all) => all.map((c) => (c.id === id ? { ...c, title } : c))),
    onError: rollback,
    onSettled: settle,
  })
  const pin = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      api(`/api/chats/${id}`, { method: "PATCH", json: { pinned } }),
    onMutate: ({ id, pinned }) =>
      patch((all) =>
        all.map((c) =>
          c.id === id ? { ...c, pinnedAt: pinned ? new Date().toISOString() : null } : c,
        ),
      ),
    onError: rollback,
    onSettled: settle,
  })
  const trash = useMutation({
    mutationFn: ({ id }: { id: string; title: string }) =>
      api<{ batch: string }>(`/api/chats/${id}`, { method: "DELETE" }),
    onMutate: ({ id }) => patch((all) => all.filter((c) => c.id !== id)),
    onSuccess: ({ batch }, { title }) =>
      toast.success(`Moved “${title}” to Trash`, {
        action: {
          label: "Undo",
          onClick: () => void api(`/api/trash/${batch}`, { method: "POST" }).then(settle),
        },
      }),
    onError: rollback,
    onSettled: () => {
      void settle()
      void queryClient.invalidateQueries({ queryKey: ["trash"] })
    },
  })
  return { rename, pin, trash }
}

/** Pinned chats first (most recently pinned), then the rest by last activity. */
export const sortChats = (chats: ChatListItem[]) =>
  [...chats].sort((a, b) => {
    if (a.pinnedAt && !b.pinnedAt) return -1
    if (b.pinnedAt && !a.pinnedAt) return 1
    if (a.pinnedAt && b.pinnedAt) return b.pinnedAt.localeCompare(a.pinnedAt)
    return b.updatedAt.localeCompare(a.updatedAt)
  })

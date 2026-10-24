"use client"

import type { Toolkit } from "@konkyo/connectors"
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useQuery } from "@/lib/use-query"
import { api } from "./fetcher"
import { qk } from "./query-keys"

export type { Toolkit }

/** A connection as the API sends it (dates as ISO strings). */
export type ConnectionRow = {
  id: string
  toolkit: Toolkit
  status: "initiated" | "active" | "expired"
  label: string | null
  watchQuery: string | null
  folderId: string | null
  syncedAt: string | null
  imported: number
}

export type RemoteItem = {
  id: string
  title: string
  detail: string
  version: string | null
  kind: "email" | "file" | "page"
  mimeType?: string
  imported: boolean
}

export const TOOLKIT_NAME: Record<Toolkit, string> = {
  gmail: "Gmail",
  googledrive: "Google Drive",
  notion: "Notion",
}

type Listing = { available: boolean; guest: boolean; connections: ConnectionRow[] }

/** The person's connectors, and whether this server and person can connect any. */
export function useConnections() {
  return useQuery({
    queryKey: qk.connections.all,
    queryFn: () => api<Listing>("/api/connections"),
  })
}

export function useConnectionActions() {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.connections.all })
  const onError = (error: Error) => toast.error(error.message)
  // Google's and Notion's consent screens open in this tab and come back to Settings.
  const connect = useMutation({
    mutationFn: (toolkit: Toolkit) =>
      api<{ id: string; redirectUrl: string }>("/api/connections", {
        method: "POST",
        json: { toolkit },
      }),
    onSuccess: ({ redirectUrl }) => window.location.assign(redirectUrl),
    onError,
  })
  const disconnect = useMutation({
    mutationFn: ({ id, keepFiles }: { id: string; keepFiles: boolean }) =>
      api(`/api/connections/${id}`, { method: "DELETE", json: { keepFiles } }),
    onSuccess: (_data, { keepFiles }) => {
      toast.success(keepFiles ? "Disconnected. Your imports stay." : "Disconnected.")
      void queryClient.invalidateQueries({ queryKey: ["files"] })
      void queryClient.invalidateQueries({ queryKey: ["trash"] })
    },
    onSettled: refresh,
    onError,
  })
  const watch = useMutation({
    mutationFn: ({
      id,
      watchQuery,
      folderId,
    }: {
      id: string
      watchQuery: string | null
      folderId?: string | null
    }) => api(`/api/connections/${id}`, { method: "PATCH", json: { watchQuery, folderId } }),
    onSuccess: (_data, { watchQuery }) =>
      toast.success(watchQuery ? "Watching. New matches come in every 15 minutes." : "Stopped."),
    onSettled: refresh,
    onError,
  })
  return { connect, disconnect, watch }
}

/** The picker's list: the account's items for a search, a page at a time. */
export function useRemoteItems(id: string | undefined, query: string) {
  return useInfiniteQuery({
    queryKey: qk.connections.items(id ?? "", query),
    enabled: Boolean(id),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ q: query })
      if (pageParam) params.set("page", pageParam)
      return api<{ items: RemoteItem[]; next: string | null }>(
        `/api/connections/${id}/items?${params}`,
      )
    },
    getNextPageParam: (last) => last.next ?? undefined,
    staleTime: 60_000,
  })
}

export function useImportItems() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      items,
      folderId,
    }: {
      id: string
      items: Pick<RemoteItem, "id" | "title" | "version" | "mimeType">[]
      folderId?: string
    }) =>
      api<{ added: number; skipped: number; already: number }>(`/api/connections/${id}/import`, {
        method: "POST",
        json: { items, folderId },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["files"] })
      void queryClient.invalidateQueries({ queryKey: qk.connections.all })
    },
    onError: (error: Error) => toast.error(error.message),
  })
}

"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { toast } from "sonner"
import { api } from "./fetcher"
import type { FolderRow } from "./folders"
import { qk } from "./query-keys"

export type { FolderRow }
export type FolderNode = FolderRow & { children: FolderNode[] }

export function useFolders() {
  return useQuery({
    queryKey: qk.folders.tree(),
    queryFn: () => api<{ folders: FolderRow[] }>("/api/folders").then((r) => r.folders),
  })
}

/** The flat list as a tree, siblings in name order. */
export function useFolderTree() {
  const { data, ...rest } = useFolders()
  const tree = useMemo(() => {
    const nodes = new Map<string, FolderNode>()
    for (const f of data ?? []) nodes.set(f.id, { ...f, children: [] })
    const roots: FolderNode[] = []
    for (const node of nodes.values()) {
      const parent = node.parentId ? nodes.get(node.parentId) : undefined
      if (parent) parent.children.push(node)
      else roots.push(node)
    }
    return roots
  }, [data])
  return { ...rest, folders: data, tree }
}

/** The breadcrumb for a folder page. */
export function useFolderPath(folderId: string) {
  return useQuery({
    queryKey: qk.folders.path(folderId),
    queryFn: () =>
      api<{ path: { id: string; name: string }[] }>(`/api/folders/${folderId}`).then((r) => r.path),
  })
}

export function useFolderActions() {
  const queryClient = useQueryClient()
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.folders.all }),
      queryClient.invalidateQueries({ queryKey: qk.files.all }),
      queryClient.invalidateQueries({ queryKey: qk.trash }),
    ])
  const onError = (error: Error) => toast.error(error.message)

  const create = useMutation({
    mutationFn: (input: { name: string; parentId?: string | null }) =>
      api<{ id: string; name: string }>("/api/folders", { method: "POST", json: input }),
    onError,
    onSettled: refresh,
  })
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api(`/api/folders/${id}`, { method: "PATCH", json: { name } }),
    onError,
    onSettled: refresh,
  })
  const move = useMutation({
    mutationFn: ({ id, parentId }: { id: string; parentId: string | null }) =>
      api(`/api/folders/${id}`, { method: "PATCH", json: { parentId } }),
    onError,
    onSettled: refresh,
  })
  const trash = useMutation({
    mutationFn: ({ id }: { id: string; name: string }) =>
      api<{ batch: string }>(`/api/folders/${id}`, { method: "DELETE" }),
    onSuccess: ({ batch }, { name }) =>
      toast.success(`Moved “${name}” to Trash`, {
        action: {
          label: "Undo",
          onClick: () => api(`/api/trash/${batch}`, { method: "POST" }).then(refresh, onError),
        },
      }),
    onError,
    onSettled: refresh,
  })
  return { create, rename, move, trash }
}

"use client"

import { LIBRARY } from "@konkyo/config"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useQuery } from "@/lib/use-query"
import { api } from "./fetcher"
import type { LibraryFile } from "./library"
import { qk } from "./query-keys"

export type { LibraryFile }

const isWorking = (f: LibraryFile) => f.status === "queued" || f.status === "processing"

/** The library list (or one folder's); refreshes itself only while something is being read. */
export function useFiles(folderId?: string) {
  return useQuery({
    queryKey: qk.files.list(folderId),
    queryFn: () =>
      api<{ files: LibraryFile[] }>(`/api/files${folderId ? `?folder=${folderId}` : ""}`).then(
        (r) => r.files,
      ),
    refetchInterval: (query) => (query.state.data?.some(isWorking) ? LIBRARY.pollMs : false),
  })
}

/** Everything filed anywhere in a space (its folders included), newest first. */
export function useSpaceFiles(spaceId: string) {
  return useQuery({
    queryKey: qk.files.list(`space:${spaceId}`),
    queryFn: () =>
      api<{ files: LibraryFile[] }>(`/api/files?space=${spaceId}`).then((r) => r.files),
    refetchInterval: (query) => (query.state.data?.some(isWorking) ? LIBRARY.pollMs : false),
  })
}

/** Fix-it and remove actions; every one refreshes the list, and "Remove" disappears at once. */
export function useFileActions() {
  const queryClient = useQueryClient()
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.files.all }),
      queryClient.invalidateQueries({ queryKey: qk.folders.all }),
      queryClient.invalidateQueries({ queryKey: qk.trash }),
    ])
  /** Applies a change to every file list on screen (the library and any folder), for undo. */
  const patchLists = async (patch: (files: LibraryFile[]) => LibraryFile[]) => {
    await queryClient.cancelQueries({ queryKey: qk.files.lists() })
    const previous = queryClient.getQueriesData<LibraryFile[]>({ queryKey: qk.files.lists() })
    queryClient.setQueriesData<LibraryFile[]>({ queryKey: qk.files.lists() }, (old) =>
      old ? patch(old) : old,
    )
    return { previous }
  }
  const rollback = (context?: { previous: [readonly unknown[], LibraryFile[] | undefined][] }) => {
    for (const [key, data] of context?.previous ?? []) queryClient.setQueryData(key, data)
  }
  const onError = (error: Error) => toast.error(error.message)

  // Optimistic: the row shows "Waiting to be read" the moment Try again is pressed.
  const retry = useMutation({
    mutationFn: (id: string) => api(`/api/files/${id}/retry`, { method: "POST" }),
    onMutate: (id) =>
      patchLists((files) =>
        files.map((f) =>
          f.id === id
            ? {
                ...f,
                status: "queued",
                stage: "Waiting to be read",
                progress: 0,
                problem: null,
                problemDetail: null,
              }
            : f,
        ),
      ),
    onError: (error, _id, context) => {
      rollback(context)
      onError(error)
    },
    onSettled: refresh,
  })
  const keepExisting = useMutation({
    mutationFn: (id: string) => api(`/api/files/${id}/keep-existing`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Kept the copy already in your library")
      return refresh()
    },
    onError,
  })
  // Optimistic: the rows leave the list at once; they come back if the server says no.
  const remove = useMutation({
    mutationFn: (ids: string | string[]) =>
      api<{ batch: string }>("/api/files/trash", {
        method: "POST",
        json: { fileIds: Array.isArray(ids) ? ids : [ids] },
      }),
    onMutate: (ids) => {
      const gone = new Set(Array.isArray(ids) ? ids : [ids])
      return patchLists((files) => files.filter((f) => !gone.has(f.id)))
    },
    onError: (error, _ids, context) => {
      rollback(context)
      onError(error)
    },
    onSuccess: ({ batch }, ids) => {
      const n = Array.isArray(ids) ? ids.length : 1
      toast.success(n > 1 ? `Moved ${n} files to Trash` : "Moved to Trash", {
        action: {
          label: "Undo",
          onClick: () =>
            api(`/api/trash/${batch}`, { method: "POST" }).then(refresh, (e: Error) => onError(e)),
        },
      })
    },
    onSettled: refresh,
  })
  /** Files into a folder (or back to the top level with `null`). */
  const move = useMutation({
    mutationFn: ({ ids, folderId }: { ids: string[]; folderId: string | null; name?: string }) =>
      api("/api/files/move", { method: "POST", json: { fileIds: ids, folderId } }),
    onSuccess: (_r, { ids, name }) =>
      toast.success(
        ids.length > 1
          ? `Moved ${ids.length} files to ${name ?? "the library"}`
          : `Moved to ${name ?? "the library"}`,
      ),
    onError,
    onSettled: refresh,
  })
  const importUrl = useMutation({
    mutationFn: ({ url, folderId }: { url: string; folderId?: string }) =>
      api<{ fileId: string }>("/api/files/import", { method: "POST", json: { url, folderId } }),
    onSuccess: refresh,
    onError,
  })
  return { retry, keepExisting, remove, move, importUrl }
}

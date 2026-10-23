"use client"

import { LIBRARY } from "@konkyo/config"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "./fetcher"
import type { LibraryFile } from "./library"
import { qk } from "./query-keys"

export type { LibraryFile }

const isWorking = (f: LibraryFile) => f.status === "queued" || f.status === "processing"

/** The library list; refreshes on its own only while something is uploading or being read. */
export function useFiles() {
  return useQuery({
    queryKey: qk.files.list(),
    queryFn: () => api<{ files: LibraryFile[] }>("/api/files").then((r) => r.files),
    refetchInterval: (query) => (query.state.data?.some(isWorking) ? LIBRARY.pollMs : false),
  })
}

/** Fix-it and remove actions; every one refreshes the list, and "Remove" disappears at once. */
export function useFileActions() {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.files.all })
  const onError = (error: Error) => toast.error(error.message)

  // Optimistic: the row shows "Waiting to be read" the moment Try again is pressed.
  const retry = useMutation({
    mutationFn: (id: string) => api(`/api/files/${id}/retry`, { method: "POST" }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: qk.files.list() })
      const previous = queryClient.getQueryData<LibraryFile[]>(qk.files.list())
      queryClient.setQueryData<LibraryFile[]>(qk.files.list(), (old) =>
        old?.map((f) =>
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
      )
      return { previous }
    },
    onError: (error, _id, context) => {
      queryClient.setQueryData(qk.files.list(), context?.previous)
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
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/files/${id}`, { method: "DELETE" }),
    // Optimistic: the row leaves the list immediately; it comes back if the server says no.
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: qk.files.list() })
      const previous = queryClient.getQueryData<LibraryFile[]>(qk.files.list())
      queryClient.setQueryData<LibraryFile[]>(qk.files.list(), (old) =>
        old?.filter((f) => f.id !== id),
      )
      return { previous }
    },
    onError: (error, _id, context) => {
      queryClient.setQueryData(qk.files.list(), context?.previous)
      onError(error)
    },
    onSuccess: () => toast.success("Moved to Trash"),
    onSettled: refresh,
  })
  const importUrl = useMutation({
    mutationFn: (url: string) =>
      api<{ fileId: string }>("/api/files/import", { method: "POST", json: { url } }),
    onSuccess: refresh,
    onError,
  })
  return { retry, keepExisting, remove, importUrl }
}

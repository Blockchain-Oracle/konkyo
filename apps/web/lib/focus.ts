"use client"

import type { FileKind } from "@konkyo/config"
import { useMemo } from "react"
import { useFolders } from "./use-folders"
import { useFiles } from "./use-library"

/** What a chat looks at (plan F10): nothing chosen means the whole library. */
export type Focus = { fileIds: string[]; folderIds: string[] }

export const WHOLE_LIBRARY: Focus = { fileIds: [], folderIds: [] }

export const isWholeLibrary = (focus: Focus) => !focus.fileIds.length && !focus.folderIds.length

export const focusOf = (scope?: { fileIds?: string[]; folderIds?: string[] } | null): Focus => ({
  fileIds: scope?.fileIds ?? [],
  folderIds: scope?.folderIds ?? [],
})

export type FocusItem =
  | { type: "file"; id: string; name: string; kind: FileKind; detail?: string }
  | { type: "folder"; id: string; name: string; detail?: string }

/** Everything a chat can focus on: folders, then the files that are ready to answer from. */
export function useFocusItems() {
  const { data: files } = useFiles()
  const { data: folders } = useFolders()
  return useMemo(() => {
    const items: FocusItem[] = [
      ...(folders ?? []).map(
        (f): FocusItem => ({
          type: "folder",
          id: f.id,
          name: f.name,
          detail: `${f.fileCount} file${f.fileCount === 1 ? "" : "s"}`,
        }),
      ),
      ...(files ?? [])
        .filter((f) => f.status === "ready")
        .map(
          (f): FocusItem => ({
            type: "file",
            id: f.id,
            name: f.title,
            kind: f.kind,
            detail: f.folderName ?? undefined,
          }),
        ),
    ]
    return items
  }, [files, folders])
}

export function toggleFocus(focus: Focus, item: Pick<FocusItem, "type" | "id">): Focus {
  const key = item.type === "file" ? "fileIds" : "folderIds"
  const has = focus[key].includes(item.id)
  return {
    ...focus,
    [key]: has ? focus[key].filter((id) => id !== item.id) : [...focus[key], item.id],
  }
}

/** A chat opened from a file or folder carries its focus in the URL (`?file=` / `?folder=`). */
export function focusFromSearch(params: URLSearchParams): Focus {
  return { fileIds: params.getAll("file"), folderIds: params.getAll("folder") }
}

/** A new chat focused on one file or folder ("Chat with this file / folder"). */
export const chatWithHref = (item: { type: "file" | "folder"; id: string }) =>
  `/chats/${crypto.randomUUID()}?${item.type}=${item.id}`

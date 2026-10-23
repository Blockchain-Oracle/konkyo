"use client"

import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { api } from "./fetcher"
import type { FileDetail, SourcePassage } from "./library"
import { qk } from "./query-keys"
import { useSourceAccess } from "./source-access"

export type { FileDetail, SourcePassage }

/** A file for the preview pane. */
export function useFileDetail(fileId: string) {
  const { api: base } = useSourceAccess()
  return useQuery({
    // The base ends the key: a public link's copy never stands in for the owner's.
    queryKey: [...qk.files.detail(fileId), base],
    queryFn: () => api<FileDetail>(`${base}/files/${fileId}`),
  })
}

/** Passages of a file in reading order, optionally one page's worth. */
export function usePassages(
  fileId: string,
  { page, enabled = true }: { page?: number; enabled?: boolean } = {},
) {
  const { api: base } = useSourceAccess()
  return useQuery({
    queryKey: [...qk.files.passages(fileId, page), base],
    queryFn: () =>
      api<SourcePassage[]>(
        `${base}/files/${fileId}/passages${page != null ? `?page=${page}` : ""}`,
      ),
    enabled,
    staleTime: Number.POSITIVE_INFINITY, // passages change only when a file is re-processed
  })
}

/** The passage a citation points at. */
export function usePassage(passageId: string | undefined) {
  const { api: base } = useSourceAccess()
  return useQuery({
    queryKey: [...qk.passage(passageId ?? ""), base],
    queryFn: () => api<SourcePassage>(`${base}/passages/${encodeURIComponent(passageId ?? "")}`),
    enabled: Boolean(passageId),
    staleTime: Number.POSITIVE_INFINITY,
  })
}

/** `matchMedia` as state; false on the server and on the first client render. */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const list = window.matchMedia(query)
    const update = () => setMatches(list.matches)
    update()
    list.addEventListener("change", update)
    return () => list.removeEventListener("change", update)
  }, [query])
  return matches
}

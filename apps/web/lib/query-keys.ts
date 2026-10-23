/** One query-key factory for every TanStack Query read (plan §3 "Data fetching and caching"). */
export const qk = {
  files: {
    all: ["files"] as const,
    lists: () => [...qk.files.all, "list"] as const,
    /** One folder's files, or the whole library. */
    list: (folderId?: string) => [...qk.files.lists(), folderId ?? "all"] as const,
    detail: (id: string) => [...qk.files.all, "detail", id] as const,
    passages: (id: string, page?: number) =>
      [...qk.files.all, "passages", id, page ?? "all"] as const,
  },
  passage: (id: string) => ["passage", id] as const,
  folders: {
    all: ["folders"] as const,
    tree: () => [...qk.folders.all, "tree"] as const,
    path: (id: string) => [...qk.folders.all, "path", id] as const,
  },
  trash: ["trash"] as const,
  memories: ["memories"] as const,
  highlights: (fileId: string) => ["highlights", fileId] as const,
  connections: {
    all: ["connections"] as const,
    items: (id: string, query: string) => ["connections", "items", id, query] as const,
  },
}

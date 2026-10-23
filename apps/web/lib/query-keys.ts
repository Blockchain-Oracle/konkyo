/** One query-key factory for every TanStack Query read (plan §3 "Data fetching and caching"). */
export const qk = {
  files: {
    all: ["files"] as const,
    list: () => [...qk.files.all, "list"] as const,
    detail: (id: string) => [...qk.files.all, "detail", id] as const,
    passages: (id: string, page?: number) =>
      [...qk.files.all, "passages", id, page ?? "all"] as const,
  },
  passage: (id: string) => ["passage", id] as const,
}

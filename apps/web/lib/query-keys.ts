/** One query-key factory for every TanStack Query read (plan §3 "Data fetching and caching"). */
export const qk = {
  files: {
    all: ["files"] as const,
    list: () => [...qk.files.all, "list"] as const,
  },
}

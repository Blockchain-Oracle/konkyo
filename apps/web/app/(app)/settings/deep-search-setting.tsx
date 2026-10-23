"use client"

import { Checkbox } from "@konkyo/ui/components/checkbox"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/lib/fetcher"

type Settings = { autoImportSources: boolean }
const key = ["settings"] as const

/** Deep search asks before importing what it found, unless this is on (plan F18). */
export function DeepSearchSetting() {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: key, queryFn: () => api<Settings>("/api/settings") })
  const save = useMutation({
    mutationFn: (autoImportSources: boolean) =>
      api<Settings>("/api/settings", { method: "PATCH", json: { autoImportSources } }),
    onMutate: (autoImportSources) => {
      const previous = queryClient.getQueryData<Settings>(key)
      if (previous) queryClient.setQueryData<Settings>(key, { ...previous, autoImportSources })
      return { previous }
    },
    onError: (error: Error, _v, context) => {
      queryClient.setQueryData(key, context?.previous)
      toast.error(error.message)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })
  return (
    <div className="flex items-start gap-3 border-y border-border py-4">
      <Checkbox
        id="auto-import"
        checked={data?.autoImportSources ?? false}
        disabled={!data}
        onCheckedChange={(on) => save.mutate(Boolean(on))}
        className="mt-0.5"
      />
      <label htmlFor="auto-import" className="text-ui text-bone-white">
        Import sources without asking
        <span className="mt-0.5 block text-snippet text-ash-gray">
          Deep search brings in what it shortlists straight away, then answers. Off, it shows you
          the list first.
        </span>
      </label>
    </div>
  )
}

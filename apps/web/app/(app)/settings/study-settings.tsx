"use client"

import { Checkbox } from "@konkyo/ui/components/checkbox"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/lib/fetcher"
import { studyKeys } from "@/lib/use-study"

type Settings = { studySound: boolean; dailyNew: number }
const key = ["settings"] as const
const DAILY = [5, 10, 15, 20, 30, 50]

/** Study's sound (plan §7.8) and how many new items a day's review brings in (F29). */
export function StudySettings() {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: key, queryFn: () => api<Settings>("/api/settings") })
  const save = useMutation({
    mutationFn: (patch: Partial<Settings>) =>
      api<Settings>("/api/settings", { method: "PATCH", json: patch }),
    onMutate: (patch) => {
      const previous = queryClient.getQueryData<Settings>(key)
      if (previous) queryClient.setQueryData<Settings>(key, { ...previous, ...patch })
      return { previous }
    },
    onError: (error: Error, _v, context) => {
      queryClient.setQueryData(key, context?.previous)
      toast.error(error.message)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key })
      void queryClient.invalidateQueries({ queryKey: studyKeys.today })
    },
  })
  return (
    <div className="divide-y divide-border border-y border-border">
      <div className="flex items-start gap-3 py-4">
        <Checkbox
          id="study-sound"
          checked={data?.studySound ?? true}
          disabled={!data}
          onCheckedChange={(on) => save.mutate({ studySound: Boolean(on) })}
          className="mt-0.5"
        />
        <label htmlFor="study-sound" className="text-ui text-bone-white">
          Study sounds
          <span className="mt-0.5 block text-snippet text-ash-gray">
            A soft sound for right, try again, hints and a finished round. Only ever in Study.
          </span>
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 py-4">
        <label htmlFor="daily-new" className="text-ui text-bone-white">
          New items a day
          <span className="mt-0.5 block text-snippet text-ash-gray">
            Today's review brings in this many new items beside the ones due.
          </span>
        </label>
        <select
          id="daily-new"
          value={data?.dailyNew ?? 15}
          disabled={!data}
          onChange={(e) => save.mutate({ dailyNew: Number(e.target.value) })}
          className="h-9 rounded-lg border border-border bg-raised px-2.5 text-ui text-bone-white"
        >
          {DAILY.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

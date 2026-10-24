"use client"

import { useSettings } from "@/lib/use-settings"
import { studyKeys } from "@/lib/use-study"
import { SelectRow } from "./setting-rows"

const DAILY = [5, 10, 15, 20, 30, 50].map((n) => ({ value: String(n), label: `${n} a day` }))

/** How many new items a day's review brings in (F29). Study's sounds live under sounds & voice. */
export function StudySettings() {
  const { settings: data, save } = useSettings({ alsoRefresh: [studyKeys.today] })
  return (
    <div className="setting-rows">
      <SelectRow
        title="New items a day"
        about="Today's review brings in this many new items beside the ones due."
        value={String(data?.dailyNew ?? 15)}
        options={DAILY}
        disabled={!data}
        onChange={(n) => save.mutate({ dailyNew: Number(n) })}
      />
    </div>
  )
}

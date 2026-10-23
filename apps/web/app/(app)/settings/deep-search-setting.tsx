"use client"

import { Checkbox } from "@konkyo/ui/components/checkbox"
import { useSettings } from "@/lib/use-settings"

/** Deep search asks before importing what it found, unless this is on (plan F18). */
export function DeepSearchSetting() {
  const { settings: data, save } = useSettings()
  return (
    <div className="flex items-start gap-3 border-y border-border py-4">
      <Checkbox
        id="auto-import"
        checked={data?.autoImportSources ?? false}
        disabled={!data}
        onCheckedChange={(on) => save.mutate({ autoImportSources: Boolean(on) })}
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

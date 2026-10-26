"use client"

import { useSettings } from "@/lib/use-settings"
import { SwitchRow } from "./setting-rows"

/** Deep search asks before importing what it found, unless this is on. */
export function DeepSearchSetting() {
  const { settings: data, save } = useSettings()
  return (
    <div className="setting-rows">
      <SwitchRow
        id="auto-import"
        title="Import sources without asking"
        about="Deep search brings in what it shortlists straight away, then answers. Off, it shows you the list first."
        checked={data?.autoImportSources ?? false}
        disabled={!data}
        onChange={(on) => save.mutate({ autoImportSources: on })}
      />
    </div>
  )
}

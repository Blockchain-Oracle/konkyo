"use client"

import { Button } from "@konkyo/ui/components/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@konkyo/ui/components/dialog"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { type CitationStyle, CitationStyleList } from "@/components/write/citation-style-list"
import { api } from "@/lib/fetcher"
import { useSettings } from "@/lib/use-settings"

/** The default citation style for Word and Google Docs exports (F26, F42); Export can still change it. */
export function CitationStyleSetting() {
  const { settings, save } = useSettings()
  const [open, setOpen] = useState(false)
  const id = settings?.citationStyle
  // The name for the stored id: the style list searched by id finds it (it's cached per query).
  const { data: name } = useQuery({
    queryKey: ["csl", "name", id],
    queryFn: () =>
      api<{ styles: CitationStyle[] }>(`/api/csl?q=${encodeURIComponent(id ?? "")}`).then(
        (r) => r.styles.find((s) => s.id === id)?.name ?? id,
      ),
    enabled: Boolean(id),
    staleTime: Number.POSITIVE_INFINITY,
  })
  const choose = (style: CitationStyle) => {
    save.mutate({ citationStyle: style.id })
    setOpen(false)
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border py-4">
      <p className="min-w-0 text-ui text-bone-white">
        Default style
        <span className="mt-0.5 block truncate text-snippet text-ash-gray">
          {name ?? "…"} · used for every export unless you pick another there.
        </span>
      </p>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} disabled={!settings}>
        Change
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle className="text-subhead font-normal">Default citation style</DialogTitle>
          <DialogDescription>
            Word and Google Docs exports use it for in-text citations and the reference list.
          </DialogDescription>
          <CitationStyleList chosen={id ?? "apa"} defaultId={id} onChoose={choose} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

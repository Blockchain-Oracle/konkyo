"use client"

import { Button } from "@konkyo/ui/components/button"
import { Checkbox } from "@konkyo/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@konkyo/ui/components/dialog"
import { Input } from "@konkyo/ui/components/input"
import { cn } from "@konkyo/ui/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { CheckIcon, FileTextIcon, SearchIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { api } from "@/lib/fetcher"

type Style = { id: string; name: string }

/**
 * Export a note (plan F26, §7.5: a searchable style list with the common ones pinned): Word,
 * its citations and reference list in the chosen CSL style. The style can be the default for
 * every export.
 */
export function ExportDialog({
  noteId,
  title,
  onClose,
}: {
  noteId: string
  title: string
  onClose: () => void
}) {
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<{ citationStyle: string }>("/api/settings"),
  })
  const [style, setStyle] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  const [makeDefault, setMakeDefault] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250)
    return () => clearTimeout(t)
  }, [query])
  const { data: styles, isFetching } = useQuery({
    queryKey: ["csl", debounced],
    queryFn: () =>
      api<{ styles: Style[] }>(`/api/csl?q=${encodeURIComponent(debounced)}`).then((r) => r.styles),
    staleTime: 5 * 60_000,
  })
  const chosen = style ?? settings?.citationStyle ?? "apa"

  const download = async () => {
    setBusy(true)
    try {
      if (makeDefault)
        await api("/api/settings", { method: "PATCH", json: { citationStyle: chosen } })
      const res = await fetch(`/api/notes/${noteId}/export?style=${encodeURIComponent(chosen)}`)
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? "That export didn't work.")
      }
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement("a")
      a.href = url
      a.download = `${title.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "Konkyo note"}.docx`
      a.click()
      URL.revokeObjectURL(url)
      onClose()
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="text-subhead font-normal">Export</DialogTitle>
        <DialogDescription>
          A Word document with your citations and reference list in the style you choose.
        </DialogDescription>
        <div className="relative mt-1">
          <SearchIcon
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ash-gray"
            strokeWidth={1.5}
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search 2,000+ citation styles"
            aria-label="Search citation styles"
            className="h-10 rounded-lg pl-9"
          />
        </div>
        <div
          role="listbox"
          aria-label="Citation style"
          className={cn(
            "max-h-64 overflow-y-auto rounded-xl border border-border",
            isFetching && "opacity-70",
          )}
        >
          {(styles ?? []).map((s) => (
            <div key={s.id}>
              <button
                type="button"
                role="option"
                aria-selected={s.id === chosen}
                onClick={() => setStyle(s.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-snippet text-silver-mist hover:bg-white/5 aria-selected:text-bone-white"
              >
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                {s.id === settings?.citationStyle && (
                  <span className="text-meta text-ash-gray">Default</span>
                )}
                {s.id === chosen && (
                  <CheckIcon className="size-3.5 text-supports" strokeWidth={2} />
                )}
              </button>
            </div>
          ))}
          {styles && !styles.length && (
            <p className="px-3 py-3 text-snippet text-ash-gray">No style by that name.</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="make-default"
            checked={makeDefault}
            onCheckedChange={(on) => setMakeDefault(Boolean(on))}
          />
          <label htmlFor="make-default" className="text-snippet text-ash-gray">
            Make this my default style
          </label>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={download} disabled={busy}>
            <FileTextIcon strokeWidth={1.5} />
            {busy ? "Exporting…" : "Export to Word"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

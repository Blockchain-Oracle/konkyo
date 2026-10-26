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
import { Skeleton } from "@konkyo/ui/components/skeleton"
import { Spinner } from "@konkyo/ui/components/spinner"
import { ToggleGroup, ToggleGroupItem } from "@konkyo/ui/components/toggle-group"
import { cn } from "@konkyo/ui/lib/utils"
import { SearchIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  type RemoteItem,
  TOOLKIT_NAME,
  type Toolkit,
  useConnections,
  useImportItems,
  useRemoteItems,
} from "@/lib/use-connections"

const PLACEHOLDER: Record<Toolkit, string> = {
  gmail: "Search Gmail, like has:attachment from:editor@journal.org",
  googledrive: "Search file names",
  notion: "Search pages",
}

/** The search box's words, once typing pauses (each search is a call to the provider). */
function useSettled(value: string, ms = 400) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return settled
}

/**
 * Import from a connected account: pick emails, Drive files or Notion pages; each is
 * fetched and read like an upload, into the folder it was opened from.
 */
export function ConnectorImportDialog({
  open,
  connectionId,
  folderId,
  onClose,
}: {
  open: boolean
  connectionId?: string
  folderId?: string
  onClose: () => void
}) {
  const { data } = useConnections()
  const active = useMemo(
    () => (data?.connections ?? []).filter((c) => c.status === "active"),
    [data],
  )
  const [chosen, setChosen] = useState<string | undefined>(connectionId)
  const current = active.find((c) => c.id === chosen) ?? active[0]
  const [query, setQuery] = useState("")
  const settled = useSettled(query.trim())
  const [picked, setPicked] = useState<Map<string, RemoteItem>>(new Map())
  const items = useRemoteItems(open ? current?.id : undefined, settled)
  const importItems = useImportItems()

  // Each opening starts on the account it was opened for, with nothing picked.
  useEffect(() => {
    if (!open) return
    setChosen(connectionId)
    setQuery("")
    setPicked(new Map())
  }, [open, connectionId])

  const rows = items.data?.pages.flatMap((p) => p.items) ?? []
  const toggle = (item: RemoteItem) =>
    setPicked((prev) => {
      const next = new Map(prev)
      if (next.has(item.id)) next.delete(item.id)
      else next.set(item.id, item)
      return next
    })

  const submit = () => {
    if (!current || !picked.size) return
    importItems.mutate(
      {
        id: current.id,
        folderId,
        items: [...picked.values()].map(({ id, title, version, mimeType }) => ({
          id,
          title,
          version,
          ...(mimeType ? { mimeType } : {}),
        })),
      },
      {
        onSuccess: ({ added, skipped }) => {
          const parts = [
            added
              ? `Importing ${added}. They'll be ready in a moment.`
              : "Already in your library.",
            skipped ? `${skipped} can't be read yet.` : "",
          ]
          toast.success(parts.filter(Boolean).join(" "))
          onClose()
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogTitle className="text-subhead font-normal">
          Import from {current ? TOOLKIT_NAME[current.toolkit] : "a connected account"}
        </DialogTitle>
        {!data ? (
          <Skeleton className="h-64 w-full" />
        ) : !active.length ? (
          <>
            <DialogDescription className="text-ui text-ash-gray">
              Connect Gmail, Google Drive or Notion in Settings, then pick what to bring in.
            </DialogDescription>
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                nativeButton={false}
                render={<Link href="/settings#connectors" onClick={onClose} />}
              >
                Open Settings
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogDescription className="text-ui text-ash-gray">
              {current?.toolkit === "gmail"
                ? "Each email is saved as a document you can cite, with its attachments."
                : "Each one is saved as a document you can cite, and kept current when it changes."}
            </DialogDescription>
            {active.length > 1 && (
              <ToggleGroup
                value={current ? [current.id] : []}
                onValueChange={(value: string[]) => {
                  if (!value[0]) return
                  setChosen(value[0])
                  setQuery("")
                  setPicked(new Map())
                }}
                aria-label="Account"
              >
                {active.map((c) => (
                  <ToggleGroupItem
                    key={c.id}
                    value={c.id}
                    className="h-8 rounded-full px-3 text-snippet"
                  >
                    {TOOLKIT_NAME[c.toolkit]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
            <div className="relative">
              <SearchIcon
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ash-gray"
                strokeWidth={1.5}
                aria-hidden
              />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                maxLength={300}
                placeholder={current ? PLACEHOLDER[current.toolkit] : ""}
                aria-label="Search"
                className="h-10 rounded-lg pl-9"
              />
            </div>
            <div className="-mx-2 max-h-80 min-h-40 overflow-y-auto" aria-busy={items.isFetching}>
              {items.isPending ? (
                <ul aria-hidden className="space-y-1 px-2">
                  {Array.from({ length: 5 }, (_, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </ul>
              ) : items.isError ? (
                <div className="flex flex-col items-center gap-3 px-3 py-8 text-center">
                  <p className="text-ui text-ash-gray">{items.error.message}</p>
                  <Button variant="secondary" size="sm" onClick={() => items.refetch()}>
                    Try again
                  </Button>
                </div>
              ) : !rows.length ? (
                <p className="px-3 py-8 text-center text-ui text-ash-gray">
                  {settled ? "Nothing matches that." : "Nothing here yet."}
                </p>
              ) : (
                <ul>
                  {rows.map((item, i) => (
                    <li
                      key={item.id}
                      className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-raised"
                    >
                      <Checkbox
                        id={`pick-${i}`}
                        checked={item.imported || picked.has(item.id)}
                        disabled={item.imported}
                        onCheckedChange={() => toggle(item)}
                        className="mt-0.5"
                      />
                      <label
                        htmlFor={`pick-${i}`}
                        className={cn("min-w-0 flex-1", !item.imported && "cursor-pointer")}
                      >
                        <span className="block truncate text-ui text-bone-white">{item.title}</span>
                        <span className="block truncate text-snippet text-ash-gray">
                          {item.imported ? "In your library" : item.detail}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {items.hasNextPage && (
                <div className="px-3 py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => items.fetchNextPage()}
                    disabled={items.isFetchingNextPage}
                  >
                    {items.isFetchingNextPage && <Spinner />}
                    Show more
                  </Button>
                </div>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={!picked.size || importItems.isPending} onClick={submit}>
                {importItems.isPending && <Spinner />}
                {picked.size ? `Import ${picked.size}` : "Import"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

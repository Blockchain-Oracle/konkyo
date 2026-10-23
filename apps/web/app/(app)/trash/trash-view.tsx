"use client"

import type { FileKind } from "@konkyo/config"
import { Button } from "@konkyo/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@konkyo/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@konkyo/ui/components/dropdown-menu"
import { Skeleton } from "@konkyo/ui/components/skeleton"
import {
  EllipsisIcon,
  FolderIcon,
  MessageSquareIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react"
import { useState } from "react"
import { EmptyState } from "@/components/empty-state"
import { KindIcon } from "@/components/library/kind-icon"
import { type TrashItem, useTrash, useTrashActions } from "@/lib/use-trash"

const DAY = 86_400_000
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })

function deletedLabel(item: TrashItem) {
  const ago = Math.round((new Date(item.deletedAt).getTime() - Date.now()) / DAY)
  const left = Math.max(0, Math.ceil((new Date(item.purgeAt).getTime() - Date.now()) / DAY))
  const parts = [
    `Deleted ${relative.format(ago, "day")}`,
    `${left} day${left === 1 ? "" : "s"} left`,
  ]
  if (item.type === "folder")
    parts.splice(0, 0, `Folder · ${item.files} file${item.files === 1 ? "" : "s"}`)
  if (item.type === "chat") parts.splice(0, 0, "Chat")
  return parts.join(" · ")
}

type Confirm = { kind: "one"; item: TrashItem } | { kind: "all" } | null

/** Trash (plan F04): 30 days to change your mind, then deleted for good. */
export function TrashView() {
  const { data: items, isPending } = useTrash()
  const { restore, deleteForever, empty } = useTrashActions()
  const [confirm, setConfirm] = useState<Confirm>(null)

  if (isPending) {
    return (
      <ul className="mt-9" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
          <li key={i} className="flex h-16 items-center gap-3 border-b border-border px-2">
            <Skeleton className="size-8 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </li>
        ))}
      </ul>
    )
  }
  if (!items?.length) {
    return (
      <div className="mt-15">
        <EmptyState
          label="Trash"
          title="Trash is empty"
          description="Deleted files, folders, chats and notes stay here for 30 days before they're gone for good."
        />
      </div>
    )
  }

  return (
    <>
      <div className="mt-9 flex flex-wrap items-center gap-3 rounded-xl bg-panel px-4 py-3">
        <p className="flex-1 text-snippet text-silver-mist">
          Things in Trash are deleted for good 30 days after you delete them. Until then, Restore
          puts them back where they were.
        </p>
        <Button variant="ghost" size="sm" onClick={() => setConfirm({ kind: "all" })}>
          Empty Trash
        </Button>
      </div>
      <ul className="mt-4.5 border-t border-border">
        {items.map((item) => (
          <li
            key={item.batch}
            className="flex min-h-16 items-center gap-3 border-b border-border px-2 py-3"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-panel">
              {item.type === "folder" ? (
                <FolderIcon className="size-4 text-ash-gray" strokeWidth={1.5} aria-hidden />
              ) : item.type === "chat" ? (
                <MessageSquareIcon className="size-4 text-ash-gray" strokeWidth={1.5} aria-hidden />
              ) : (
                <KindIcon kind={(item.kind ?? "pdf") as FileKind} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-ui text-silver-mist" title={item.name}>
                {item.name}
              </p>
              <p className="mt-0.5 truncate text-meta text-ash-gray">{deletedLabel(item)}</p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 px-3 text-snippet"
              onClick={() => restore.mutate({ batch: item.batch, name: item.name })}
            >
              <RotateCcwIcon strokeWidth={1.75} />
              Restore
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`More for ${item.name}`}
                    className="text-ash-gray hover:text-bone-white"
                  />
                }
              >
                <EllipsisIcon strokeWidth={1.5} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setConfirm({ kind: "one", item })}
                >
                  <Trash2Icon strokeWidth={1.5} />
                  Delete forever
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ))}
      </ul>

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle className="text-subhead font-normal">
            {confirm?.kind === "all" ? "Empty Trash?" : `Delete “${confirm?.item.name}” forever?`}
          </DialogTitle>
          <DialogDescription className="text-ui text-ash-gray">
            {confirm?.kind === "all"
              ? `${items.length} item${items.length === 1 ? "" : "s"} will be deleted for good, with their passages and evidence. This can't be undone.`
              : "It will be deleted for good, with its passages and evidence. This can't be undone."}
          </DialogDescription>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirm?.kind === "all") empty.mutate()
                else if (confirm) deleteForever.mutate(confirm.item.batch)
                setConfirm(null)
              }}
            >
              Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

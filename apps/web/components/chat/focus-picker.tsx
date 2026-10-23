"use client"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@konkyo/ui/components/command"
import { Popover, PopoverContent, PopoverTrigger } from "@konkyo/ui/components/popover"
import { cn } from "@konkyo/ui/lib/utils"
import { FolderIcon, LibraryBigIcon } from "lucide-react"
import type { ReactElement } from "react"
import { KindIcon } from "@/components/library/kind-icon"
import { type Focus, type FocusItem, isWholeLibrary, toggleFocus, WHOLE_LIBRARY } from "@/lib/focus"

export function FocusIcon({ item, className }: { item: FocusItem; className?: string }) {
  return item.type === "folder" ? (
    <FolderIcon className={cn("size-3.5 text-ash-gray", className)} strokeWidth={1.5} aria-hidden />
  ) : (
    <KindIcon kind={item.kind} className={cn("size-3.5", className)} />
  )
}

const isIn = (focus: Focus, item: FocusItem) =>
  (item.type === "file" ? focus.fileIds : focus.folderIds).includes(item.id)

/**
 * Choose what a chat looks at (plan F10): any mix of folders and files, or the whole library.
 * Opens from the composer's focus pill; `@` in the text opens the same list inline.
 */
export function FocusPicker({
  items,
  focus,
  onChange,
  trigger,
  open,
  onOpenChange,
}: {
  items: FocusItem[]
  focus: Focus
  onChange: (focus: Focus) => void
  trigger: ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const folders = items.filter((i) => i.type === "folder")
  const files = items.filter((i) => i.type === "file")
  const row = (item: FocusItem) => (
    <CommandItem
      key={`${item.type}:${item.id}`}
      value={`${item.type}:${item.id} ${item.name}`}
      data-checked={isIn(focus, item)}
      onSelect={() => onChange(toggleFocus(focus, item))}
      className="gap-2.5 rounded-lg py-2"
    >
      <FocusIcon item={item} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-snippet text-bone-white">{item.name}</span>
        {item.detail && (
          <span className="block truncate text-meta text-ash-gray">{item.detail}</span>
        )}
      </span>
    </CommandItem>
  )
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={trigger} />
      <PopoverContent side="top" align="start" className="w-80 p-0">
        <Command>
          <CommandInput
            placeholder="Search files and folders"
            aria-label="Search files and folders"
          />
          <CommandList>
            <CommandEmpty className="text-snippet text-ash-gray">Nothing matches.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="whole library"
                data-checked={isWholeLibrary(focus)}
                onSelect={() => onChange(WHOLE_LIBRARY)}
                className="gap-2.5 rounded-lg py-2"
              >
                <LibraryBigIcon className="size-3.5 text-ash-gray" strokeWidth={1.5} />
                <span className="text-snippet text-bone-white">Whole library</span>
              </CommandItem>
            </CommandGroup>
            {folders.length > 0 && (
              <CommandGroup heading="Folders">{folders.map(row)}</CommandGroup>
            )}
            {files.length > 0 && <CommandGroup heading="Files">{files.map(row)}</CommandGroup>}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** Items matching what follows an `@`, folders first, at most 8. */
export function mentionMatches(items: FocusItem[], query: string) {
  const q = query.toLowerCase()
  return items.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 8)
}

/** The inline list under an `@` (the keyboard stays in the text box: ↑ ↓ to move, ↵ to pick). */
export function MentionList({
  matches,
  active,
  onPick,
}: {
  matches: FocusItem[]
  active: number
  onPick: (item: FocusItem) => void
}) {
  return (
    <div
      role="listbox"
      aria-label="Files and folders"
      className="absolute bottom-full left-0 z-40 mb-2 w-80 max-w-full animate-in rounded-xl bg-popover p-1 shadow-md ring-1 ring-foreground/10 duration-100 fade-in-0 zoom-in-95"
    >
      {matches.length ? (
        matches.map((item, i) => (
          <div
            key={`${item.type}:${item.id}`}
            role="option"
            tabIndex={-1}
            aria-selected={i === active}
            // mousedown, so the text box keeps focus and the pick lands before blur.
            onMouseDown={(e) => {
              e.preventDefault()
              onPick(item)
            }}
            className={cn(
              "flex cursor-default items-center gap-2.5 rounded-lg px-2 py-2",
              i === active && "bg-muted",
            )}
          >
            <FocusIcon item={item} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-snippet text-bone-white">{item.name}</span>
              {item.detail && (
                <span className="block truncate text-meta text-ash-gray">{item.detail}</span>
              )}
            </span>
          </div>
        ))
      ) : (
        <p className="px-2 py-3 text-snippet text-ash-gray">No file or folder by that name.</p>
      )}
    </div>
  )
}

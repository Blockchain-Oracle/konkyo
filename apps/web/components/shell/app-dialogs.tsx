"use client"

import { Button } from "@konkyo/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@konkyo/ui/components/dialog"
import { Input } from "@konkyo/ui/components/input"
import { cn } from "@konkyo/ui/lib/utils"
import { CheckIcon, FolderIcon, LibraryBigIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"
import { ConnectorImportDialog } from "@/components/library/connector-import-dialog"
import { LectureRecorder } from "@/components/library/lecture-recorder"
import { ShareDialog } from "@/components/library/share-dialog"
import { flattenTree, useFolderActions, useFolderTree } from "@/lib/use-folders"
import { useFileActions } from "@/lib/use-library"
import { SpaceMaker } from "./space-maker"

/** The app's small dialogs, opened from anywhere (Create menu, sidebar, rows, ⌘K). */
type DialogState =
  | { type: "new-folder"; parentId?: string | null; template?: string }
  | { type: "rename-folder"; id: string; name: string }
  | { type: "import"; folderId?: string }
  | { type: "move-files"; ids: string[] }
  | { type: "share-folder"; id: string; name: string }
  | { type: "connector-import"; connectionId?: string; folderId?: string }
  | { type: "record"; folderId?: string }
  | null

let current: DialogState = null
const listeners = new Set<() => void>()
const set = (next: DialogState) => {
  current = next
  for (const l of listeners) l()
}

export const openNewFolder = (parentId?: string | null) => set({ type: "new-folder", parentId })
/** The space maker, opened on one of its templates (first-run Home's chooser). */
export const openSpaceMaker = (template?: string) =>
  set({ type: "new-folder", parentId: null, template })
export const openRenameFolder = (id: string, name: string) =>
  set({ type: "rename-folder", id, name })
export const openImport = (folderId?: string) => set({ type: "import", folderId })
export const openMoveFiles = (ids: string[]) => set({ type: "move-files", ids })
export const openShareFolder = (id: string, name: string) => set({ type: "share-folder", id, name })
export const openConnectorImport = (at: { connectionId?: string; folderId?: string } = {}) =>
  set({ type: "connector-import", ...at })
export const openRecorder = (folderId?: string) => set({ type: "record", folderId })

function useDialog() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
    () => null,
  )
}

export function AppDialogs() {
  const dialog = useDialog()
  const close = () => set(null)
  return (
    <>
      {/* A new top-level folder is a space: it gets the space maker (F45). */}
      <SpaceMaker
        key={
          dialog?.type === "new-folder" && !dialog.parentId
            ? `open-${dialog.template ?? ""}`
            : "closed"
        }
        open={dialog?.type === "new-folder" && !dialog.parentId}
        template={dialog?.type === "new-folder" ? dialog.template : undefined}
        onClose={close}
      />
      <NameDialog
        key={dialog?.type === "rename-folder" ? dialog.id : "new"}
        open={
          (dialog?.type === "new-folder" && Boolean(dialog.parentId)) ||
          dialog?.type === "rename-folder"
        }
        dialog={dialog}
        onClose={close}
      />
      <ImportUrlDialog
        open={dialog?.type === "import"}
        folderId={dialog?.type === "import" ? dialog.folderId : undefined}
        onClose={close}
      />
      <MoveDialog
        open={dialog?.type === "move-files"}
        ids={dialog?.type === "move-files" ? dialog.ids : []}
        onClose={close}
      />
      <ShareDialog
        folder={dialog?.type === "share-folder" ? { id: dialog.id, name: dialog.name } : null}
        onClose={close}
      />
      <ConnectorImportDialog
        open={dialog?.type === "connector-import"}
        connectionId={dialog?.type === "connector-import" ? dialog.connectionId : undefined}
        folderId={dialog?.type === "connector-import" ? dialog.folderId : undefined}
        onClose={close}
      />
      <LectureRecorder
        open={dialog?.type === "record"}
        folderId={dialog?.type === "record" ? dialog.folderId : undefined}
        onClose={close}
      />
    </>
  )
}

/** New folder, or a new name for one. */
function NameDialog({
  open,
  dialog,
  onClose,
}: {
  open: boolean
  dialog: DialogState
  onClose: () => void
}) {
  const renaming = dialog?.type === "rename-folder"
  const [name, setName] = useState(renaming ? dialog.name : "")
  const { create, rename } = useFolderActions()
  const router = useRouter()
  const pending = create.isPending || rename.isPending

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle className="text-subhead font-normal">
          {renaming ? "Rename folder" : "New folder"}
        </DialogTitle>
        <form
          className="mt-1 flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!name.trim()) return
            if (dialog?.type === "rename-folder") {
              rename.mutate({ id: dialog.id, name }, { onSuccess: onClose })
            } else {
              create.mutate(
                { name, parentId: dialog?.type === "new-folder" ? dialog.parentId : null },
                {
                  onSuccess: (folder) => {
                    onClose()
                    setName("")
                    router.push(`/library/folders/${folder.id}`)
                  },
                },
              )
            }
          }}
        >
          <Input
            autoFocus
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            placeholder="Folder name"
            aria-label="Folder name"
            className="h-10 rounded-lg"
          />
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || pending}>
              {renaming ? "Rename" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const DOI = /^(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/\S+)$/i

/** What was pasted, if it is something to import: a DOI (as its doi.org link) or a web address. */
export function importable(raw: string): { url: string; label: string } | null {
  const text = raw.trim()
  const doi = text.match(DOI)?.[1]
  if (doi) return { url: `https://doi.org/${doi}`, label: `the paper with DOI ${doi}` }
  if (/^https?:\/\/\S+\.\S+/i.test(text)) return { url: text, label: text }
  return null
}

/** A web page, a link to a PDF, a YouTube video, or a DOI, into the library or a folder. */
function ImportUrlDialog({
  open,
  folderId,
  onClose,
}: {
  open: boolean
  folderId?: string
  onClose: () => void
}) {
  const { importUrl } = useFileActions()
  const [url, setUrl] = useState("")
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="text-subhead font-normal">Import by URL</DialogTitle>
        <DialogDescription className="text-ui text-ash-gray">
          A web page, a link to a PDF, a YouTube video, or a paper's DOI. It's saved as a document
          you can cite.
        </DialogDescription>
        <form
          className="mt-1.5 flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            importUrl.mutate(
              { url: importable(url)?.url ?? url.trim(), folderId },
              {
                onSuccess: () => {
                  toast.success("Importing. It'll be ready in a moment.")
                  setUrl("")
                  onClose()
                },
              },
            )
          }}
        >
          <Input
            autoFocus
            inputMode="url"
            required
            placeholder="https://… or a DOI"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-label="Address or DOI to import"
            className="h-10 rounded-lg"
          />
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!url.trim() || importUrl.isPending}>
              Import
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Pick where files go: a folder, or the library's top level. */
function MoveDialog({ open, ids, onClose }: { open: boolean; ids: string[]; onClose: () => void }) {
  const { tree } = useFolderTree()
  const { move } = useFileActions()
  const [query, setQuery] = useState("")
  const [target, setTarget] = useState<{ id: string | null; name: string } | null>(null)
  const rows = useMemo(() => flattenTree(tree), [tree])
  const q = query.trim().toLowerCase()
  const visible = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose()
          setTarget(null)
          setQuery("")
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="text-subhead font-normal">
          Move {ids.length > 1 ? `${ids.length} files` : "file"} to…
        </DialogTitle>
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a folder"
          aria-label="Find a folder"
          className="h-10 rounded-lg"
        />
        <div role="listbox" aria-label="Folders" className="-mx-2 max-h-72 overflow-y-auto">
          {!q && (
            <MoveOption
              selected={target?.id === null}
              onSelect={() => setTarget({ id: null, name: "the library" })}
              icon={<LibraryBigIcon className="size-4 text-ash-gray" strokeWidth={1.5} />}
              label="Library (no folder)"
              depth={0}
            />
          )}
          {visible.map((row) => (
            <MoveOption
              key={row.id}
              selected={target?.id === row.id}
              onSelect={() => setTarget({ id: row.id, name: row.name })}
              icon={<FolderIcon className="size-4 text-ash-gray" strokeWidth={1.5} />}
              label={row.name}
              depth={q ? 0 : row.depth}
            />
          ))}
          {!visible.length && q && (
            <p className="px-3 py-6 text-center text-ui text-ash-gray">No folder called that.</p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!target || move.isPending}
            onClick={() =>
              target &&
              move.mutate({ ids, folderId: target.id, name: target.name }, { onSuccess: onClose })
            }
          >
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MoveOption({
  selected,
  onSelect,
  icon,
  label,
  depth,
}: {
  selected: boolean
  onSelect: () => void
  icon: React.ReactNode
  label: string
  depth: number
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left text-ui text-silver-mist transition-colors duration-(--duration-press) hover:bg-raised",
        selected && "bg-raised text-bone-white",
      )}
      style={{ paddingLeft: 12 + depth * 16 }}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {selected && <CheckIcon className="size-4 text-bone-white" strokeWidth={2} />}
    </button>
  )
}

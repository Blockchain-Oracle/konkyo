"use client"

import { FileTree, FileTreeItem, FileTreeList } from "@konkyo/ui/components/file-tree"
import { FolderIcon, FolderOpenIcon, PlusIcon } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useMemo } from "react"
import { FILE_DRAG_TYPE } from "@/components/library/file-row"
import { type FolderNode, useFolderTree } from "@/lib/use-folders"
import { useFileActions } from "@/lib/use-library"
import { openNewFolder } from "./app-dialogs"

const FOLDER_PATH = /^\/library\/folders\/([0-9a-f-]{36})/

/**
 * The sidebar's folders (plan §7.3): a keyboard-navigable tree; the open folder is selected, and
 * library rows dropped on a folder are filed there.
 */
export function FolderTree() {
  const { tree, folders, isPending } = useFolderTree()
  const pathname = usePathname()
  const router = useRouter()
  const { move } = useFileActions()
  const activeId = pathname.match(FOLDER_PATH)?.[1]

  // Keep the open folder's parents expanded, so the selection is always in view.
  const expanded = useMemo(() => {
    const byId = new Map((folders ?? []).map((f) => [f.id, f]))
    const ids: string[] = []
    let parent = activeId ? byId.get(activeId)?.parentId : null
    while (parent) {
      ids.push(parent)
      parent = byId.get(parent)?.parentId ?? null
    }
    return ids
  }, [folders, activeId])

  const nameOf = (id: string) => folders?.find((f) => f.id === id)?.name

  return (
    <div className="group-data-[collapsible=icon]:hidden">
      <div className="flex items-center justify-between pr-1 pl-2">
        <span className="text-micro text-saffron-spark uppercase">Folders</span>
        <button
          type="button"
          aria-label="New folder"
          onClick={() => openNewFolder(null)}
          className="grid size-6 place-items-center rounded-full text-ash-gray transition-colors duration-(--duration-press) hover:bg-raised hover:text-bone-white"
        >
          <PlusIcon className="size-3.5" strokeWidth={1.75} />
        </button>
      </div>
      {!isPending && !tree.length ? (
        <p className="mt-1 px-2 text-snippet text-ash-gray">
          Folders you create or upload appear here.
        </p>
      ) : (
        <FileTree
          key={expanded.join(",")}
          className="mt-1 rounded-none border-0 [&>div]:p-0"
          indentSize={14}
          defaultExpandedIds={expanded}
          selectedIds={activeId ? [activeId] : []}
          onNodeClick={(id) => router.push(`/library/folders/${id}`)}
          onNodeDragOver={(_id, event) => {
            if (event.dataTransfer.types.includes(FILE_DRAG_TYPE)) event.preventDefault()
          }}
          onNodeDrop={(id, event) => {
            const raw = event.dataTransfer.getData(FILE_DRAG_TYPE)
            if (!raw) return
            event.preventDefault()
            move.mutate({ ids: JSON.parse(raw) as string[], folderId: id, name: nameOf(id) })
          }}
        >
          <FileTreeList aria-label="Folders">
            {tree.map((node) => (
              <FolderItem key={node.id} node={node} />
            ))}
          </FileTreeList>
        </FileTree>
      )}
    </div>
  )
}

function FolderItem({ node }: { node: FolderNode }) {
  return (
    <FileTreeItem
      nodeId={node.id}
      label={node.name}
      hasChildren={node.children.length > 0}
      icon={<FolderIcon className="size-4 text-ash-gray" strokeWidth={1.5} />}
      openIcon={<FolderOpenIcon className="size-4 text-ash-gray" strokeWidth={1.5} />}
    >
      {node.children.length > 0 &&
        node.children.map((child) => <FolderItem key={child.id} node={child} />)}
    </FileTreeItem>
  )
}

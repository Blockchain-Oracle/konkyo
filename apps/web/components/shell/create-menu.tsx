"use client"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@konkyo/ui/components/dropdown-menu"
import { SidebarMenuButton } from "@konkyo/ui/components/sidebar"
import {
  BotIcon,
  FolderPlusIcon,
  FolderUpIcon,
  LinkIcon,
  NotebookPenIcon,
  PlugIcon,
  PlusIcon,
  UploadIcon,
} from "lucide-react"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useUploads } from "@/components/library/uploads-provider"
import { openConnectorImport, openImport, openNewFolder } from "./app-dialogs"

type CreateItem = { label: string; icon: typeof PlusIcon; href?: Route; run?: () => void }

export function CreateMenu() {
  const router = useRouter()
  const { pickFiles, pickFolder } = useUploads()
  // Folders, uploads and imports happen right here; agents and notes open where they're made.
  const CREATE_GROUPS: CreateItem[][] = [
    [
      { label: "Agent", icon: BotIcon, href: "/agents?new=1" as Route },
      { label: "Note", icon: NotebookPenIcon, href: "/write" },
      { label: "Folder", icon: FolderPlusIcon, run: () => openNewFolder(null) },
    ],
    [
      { label: "Upload files", icon: UploadIcon, run: () => pickFiles() },
      { label: "Upload a folder", icon: FolderUpIcon, run: () => pickFolder() },
      { label: "Import by URL", icon: LinkIcon, run: () => openImport() },
      { label: "Gmail, Drive, Notion", icon: PlugIcon, run: () => openConnectorImport() },
    ],
  ]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            tooltip="Create"
            className="h-9 justify-start rounded-full border border-input text-ui text-bone-white hover:border-line-strong group-data-[collapsible=icon]:rounded-full group-data-[collapsible=icon]:border-0"
          />
        }
      >
        <PlusIcon strokeWidth={1.5} />
        <span>Create</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {CREATE_GROUPS.map((group, index) => (
          <DropdownMenuGroup key={group[0]?.label}>
            {index > 0 && <DropdownMenuSeparator />}
            {group.map((item) => (
              <DropdownMenuItem
                key={item.label}
                onClick={() => (item.run ? item.run() : item.href && router.push(item.href))}
              >
                <item.icon strokeWidth={1.5} />
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

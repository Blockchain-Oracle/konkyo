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
  PlusIcon,
  UploadIcon,
} from "lucide-react"
import type { Route } from "next"
import { useRouter } from "next/navigation"

type CreateItem = { label: string; icon: typeof PlusIcon; href: Route }

/** Each item opens the place where that thing is made (plan §7.3 "Create ▾"). */
const CREATE_GROUPS: CreateItem[][] = [
  [
    { label: "Agent", icon: BotIcon, href: "/agents" },
    { label: "Note", icon: NotebookPenIcon, href: "/write" },
    { label: "Folder", icon: FolderPlusIcon, href: "/library" },
  ],
  [
    { label: "Upload files", icon: UploadIcon, href: "/library" },
    { label: "Upload a folder", icon: FolderUpIcon, href: "/library" },
    { label: "Import by URL or DOI", icon: LinkIcon, href: "/library" },
  ],
]

export function CreateMenu() {
  const router = useRouter()
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
              <DropdownMenuItem key={item.label} onClick={() => router.push(item.href)}>
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

"use client"

import { APP } from "@konkyo/config"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
} from "@konkyo/ui/components/sidebar"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { FOOTER_NAV, isActive, MAIN_NAV } from "@/lib/navigation"
import { useUnread } from "@/lib/use-inbox"
import { BrandMark } from "../brand-mark"
import { AccountMenu, type ShellUser } from "./account-menu"
import { CreateMenu } from "./create-menu"
import { FolderTree } from "./folder-tree"
import { RecentChats } from "./recent-chats"

export function AppSidebar({ user }: { user: ShellUser }) {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-3 pt-3">
        <div className="flex h-8 items-center justify-between px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <Link
            href="/home"
            aria-label={`${APP.name} home`}
            className="inline-flex items-center gap-2 text-nav-label font-semibold text-bone-white uppercase group-data-[collapsible=icon]:hidden"
          >
            <BrandMark small className="size-5" />
            {APP.name}
          </Link>
          <SidebarTrigger className="text-ash-gray hover:text-bone-white" />
        </div>
        <CreateMenu />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {MAIN_NAV.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  isActive={isActive(pathname, item.href)}
                  tooltip={item.label}
                  render={<Link href={item.href} />}
                  className="text-ui text-ash-gray data-active:text-bone-white"
                >
                  <item.icon strokeWidth={1.5} />
                  <span>{item.label}</span>
                </SidebarMenuButton>
                {item.href === "/inbox" && <UnreadBadge />}
                {item.href === "/chats" && <RecentChats />}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <FolderTree />
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {FOOTER_NAV.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                isActive={isActive(pathname, item.href)}
                tooltip={item.label}
                render={<Link href={item.href} />}
                className="text-ui text-ash-gray data-active:text-bone-white"
              >
                <item.icon strokeWidth={1.5} />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        <AccountMenu user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

/** Unread Inbox items, beside Inbox. */
function UnreadBadge() {
  const { data: unread } = useUnread()
  if (!unread) return null
  return (
    <SidebarMenuBadge className="rounded-full bg-electric-iris px-1.5 text-[11px] text-white tabular-nums">
      {unread > 99 ? "99+" : unread}
      <span className="sr-only"> unread</span>
    </SidebarMenuBadge>
  )
}

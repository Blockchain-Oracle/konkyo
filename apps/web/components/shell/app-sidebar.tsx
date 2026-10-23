"use client"

import { APP } from "@konkyo/config"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
} from "@konkyo/ui/components/sidebar"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { FOOTER_NAV, isActive, MAIN_NAV } from "@/lib/navigation"
import { BrandMark } from "../brand-mark"
import { AccountMenu, type ShellUser } from "./account-menu"
import { CreateMenu } from "./create-menu"

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
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-micro text-saffron-spark uppercase">
            Folders
          </SidebarGroupLabel>
          <p className="px-2 text-snippet text-ash-gray group-data-[collapsible=icon]:hidden">
            Folders you create or import appear here.
          </p>
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

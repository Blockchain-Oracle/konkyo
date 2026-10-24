"use client"

import { SPACES } from "@konkyo/config"
import { Tooltip, TooltipContent, TooltipTrigger } from "@konkyo/ui/components/tooltip"
import { colorFor, readableInk } from "@konkyo/ui/lib/space"
import { cn } from "@konkyo/ui/lib/utils"
import { PlusIcon } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useMemo } from "react"
import { isActive, MAIN_NAV, type NavItem } from "@/lib/navigation"
import { sound } from "@/lib/sounds"
import { type FolderRow, useFolders } from "@/lib/use-folders"
import { useUnread } from "@/lib/use-inbox"
import { BrandMark } from "../brand-mark"
import { AccountMenu, type ShellUser } from "./account-menu"
import { openNewFolder } from "./app-dialogs"

/** Top-level folders are spaces; the rail shows them as colour tiles (plan §16.6). */
export function useSpaces() {
  const { data } = useFolders()
  return useMemo(() => (data ?? []).filter((f) => !f.parentId), [data])
}

/** The space a page belongs to: the top of the folder it shows (`/library/folders/:id`). */
export function useCurrentSpaceId() {
  const pathname = usePathname()
  const { data } = useFolders()
  return useMemo(() => {
    const match = /^\/library\/folders\/([^/]+)/.exec(pathname)
    if (!match) return null
    const byId = new Map((data ?? []).map((f) => [f.id, f]))
    let folder = byId.get(match[1] ?? "")
    while (folder?.parentId) folder = byId.get(folder.parentId)
    return folder?.id ?? match[1] ?? null
  }, [pathname, data])
}

const spaceHref = (id: string) => `/library/folders/${id}` as Route

/** One space as a tile: its colour, its first letter, a white ring when you're in it. */
export function SpaceTile({
  space,
  active,
  size = "md",
}: {
  space: Pick<FolderRow, "id" | "name">
  active: boolean
  size?: "sm" | "md"
}) {
  const hex = SPACES.colors[colorFor(space.id)].hex
  return (
    <Link
      href={spaceHref(space.id)}
      onClick={() => sound("tap")}
      aria-current={active ? "page" : undefined}
      className={cn(
        "grid shrink-0 place-items-center rounded-tile font-display font-extrabold transition-[translate,box-shadow] duration-(--dur-quick) ease-(--ease-glide) hover:-translate-y-0.5 focus-visible:outline-3 focus-visible:outline-lime",
        size === "md" ? "size-12 text-xl" : "size-10 text-base",
        active && "ring-[3px] ring-white ring-offset-2 ring-offset-rail",
      )}
      style={{ background: hex, color: readableInk(hex) }}
    >
      {space.name.trim().charAt(0).toLowerCase() || "·"}
      <span className="sr-only">{space.name}</span>
    </Link>
  )
}

function NavButton({ item, active, badge }: { item: NavItem; active: boolean; badge?: number }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={item.href}
            onClick={() => sound("tap")}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative grid size-11 place-items-center rounded-full text-room-muted transition-[translate,background-color,color] duration-(--dur-quick) ease-(--ease-glide) hover:-translate-y-0.5 hover:bg-white/8 hover:text-white",
              active && "bg-white text-ink hover:bg-white hover:text-ink",
            )}
          />
        }
      >
        <item.icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
        <span className="sr-only">{item.label}</span>
        {badge ? (
          <span className="absolute -top-0.5 -right-0.5 min-w-4.5 rounded-full bg-lime px-1 text-center text-[10px] leading-4.5 font-bold text-ink tabular-nums">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        {item.label.toLowerCase()}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * The floating rail (plan §16.6, OurSpaces Rail): a dark rounded panel inset from the left edge.
 * The mark goes home; then the places; then your spaces as colour tiles; a dashed lime + makes a
 * new space; your look opens the account menu. Desktop only; phones get the bottom bar.
 */
export function Rail({ user }: { user: ShellUser }) {
  const pathname = usePathname()
  const { data: unread } = useUnread()
  const spaces = useSpaces()
  const current = useCurrentSpaceId()

  return (
    <nav
      aria-label="Main"
      className="fixed inset-y-4 left-4 z-40 hidden w-[72px] flex-col items-center gap-1.5 rounded-card bg-rail py-3 shadow-dark md:flex"
    >
      <Link
        href="/home"
        aria-label="Konkyo home"
        onClick={() => sound("tap")}
        className="mb-1 grid size-12 place-items-center rounded-tile transition-transform duration-(--dur-quick) hover:-rotate-6"
      >
        <BrandMark small className="size-7" />
      </Link>

      {MAIN_NAV.map((item) => (
        <NavButton
          key={item.href}
          item={item}
          // Inside a space the space's tile is "you are here", not Library.
          active={item.href === "/library" && current ? false : isActive(pathname, item.href)}
          badge={item.href === "/inbox" ? unread : undefined}
        />
      ))}

      <span aria-hidden className="my-2 h-px w-8 shrink-0 bg-white/12" />

      <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-2.5 overflow-y-auto px-3 py-1 [scrollbar-width:none]">
        {spaces.map((space) => (
          <Tooltip key={space.id}>
            <TooltipTrigger render={<span className="inline-flex" />}>
              <SpaceTile space={space} active={current === space.id} />
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              {space.name}
            </TooltipContent>
          </Tooltip>
        ))}
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() => {
                  sound("tap")
                  openNewFolder(null)
                }}
                className="group grid size-12 shrink-0 place-items-center rounded-tile border-2 border-dashed border-lime/70 text-lime transition-colors duration-(--dur-quick) hover:border-lime hover:bg-lime hover:text-ink"
              />
            }
          >
            <PlusIcon
              className="size-5 transition-transform duration-(--dur-base) ease-(--ease-pop) group-hover:rotate-90"
              strokeWidth={2.5}
            />
            <span className="sr-only">New space</span>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={10}>
            new space
          </TooltipContent>
        </Tooltip>
      </div>

      <AccountMenu user={user} />
    </nav>
  )
}

"use client"

import { cn } from "@konkyo/ui/lib/utils"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { isActive, MAIN_NAV, MOBILE_TABS } from "@/lib/navigation"
import { sound } from "@/lib/sounds"
import { useUnread } from "@/lib/use-inbox"
import { AccountMenu, type ShellUser } from "./account-menu"

const TABS = MAIN_NAV.filter((item) => MOBILE_TABS.includes(item.href))

/**
 * Phones (<768px): the rail becomes a floating bottom bar (plan §16.6, OurSpaces on a phone), the
 * five most-used places and your look; spaces live in Library. Clear of the home indicator.
 */
export function BottomBar({ user }: { user: ShellUser }) {
  const pathname = usePathname()
  const { data: unread } = useUnread()
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 flex h-16 items-center justify-between rounded-card bg-rail px-2 shadow-dark md:hidden"
    >
      {TABS.map((item) => {
        const active = isActive(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => sound("tap")}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative grid size-12 place-items-center rounded-full text-room-muted transition-colors duration-(--dur-quick)",
              active && "bg-white text-ink",
            )}
          >
            <item.icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
            <span className="sr-only">{item.label}</span>
            {item.href === "/inbox" && Boolean(unread) && (
              <span className="absolute top-1.5 right-1.5 size-2.5 rounded-full bg-lime ring-2 ring-rail">
                <span className="sr-only">{unread} unread</span>
              </span>
            )}
          </Link>
        )
      })}
      <AccountMenu user={user} side="top" />
    </nav>
  )
}

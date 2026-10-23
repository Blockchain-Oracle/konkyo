"use client"

import { cn } from "@konkyo/ui/lib/utils"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { isActive, MAIN_NAV, MOBILE_TABS } from "@/lib/navigation"

const TABS = MAIN_NAV.filter((item) => MOBILE_TABS.includes(item.href))

/** Phones (<768px): a native-feeling bottom bar; the sidebar opens as a sheet for the rest. */
export function MobileTabBar() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-5">
        {TABS.map((item) => {
          const active = isActive(pathname, item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-1 text-[11px] text-ash-gray transition-colors duration-(--duration-press)",
                  active && "text-bone-white",
                )}
              >
                <item.icon className="size-5" strokeWidth={1.5} />
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

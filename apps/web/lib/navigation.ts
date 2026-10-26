import {
  BotIcon,
  GraduationCapIcon,
  HouseIcon,
  InboxIcon,
  LibraryBigIcon,
  MessagesSquareIcon,
  PenLineIcon,
  SettingsIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react"
import type { Route } from "next"

export type NavItem = { href: Route; label: string; icon: typeof HouseIcon }

/** The sidebar's main destinations: every object in the product has a home. */
export const MAIN_NAV: NavItem[] = [
  { href: "/home", label: "Home", icon: HouseIcon },
  { href: "/library", label: "Library", icon: LibraryBigIcon },
  { href: "/chats", label: "Chats", icon: MessagesSquareIcon },
  { href: "/study", label: "Study", icon: GraduationCapIcon },
  { href: "/write", label: "Write", icon: PenLineIcon },
  { href: "/agents", label: "Agents", icon: BotIcon },
  { href: "/inbox", label: "Inbox", icon: InboxIcon },
]

export const FOOTER_NAV: NavItem[] = [
  { href: "/people" as Route, label: "People", icon: UsersIcon },
  { href: "/trash", label: "Trash", icon: Trash2Icon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
]

/** Phones get a bottom tab bar with the five most-used places; the rest live in the menu. */
export const MOBILE_TABS: Route[] = ["/home", "/library", "/chats", "/study", "/inbox"]

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

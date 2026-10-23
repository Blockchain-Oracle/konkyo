import { SidebarTrigger } from "@konkyo/ui/components/sidebar"

/** Phones get a slim bar with the menu button; desktop pages start straight with content. */
export function MobileHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-background/95 px-3 md:hidden">
      <SidebarTrigger className="text-ash-gray" />
      <span className="min-w-0 flex-1 truncate text-ui text-bone-white">{title}</span>
      {children}
    </header>
  )
}

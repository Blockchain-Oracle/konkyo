import { SidebarTrigger } from "@konkyo/ui/components/sidebar"

/** Phones get a slim bar with the menu button; desktop pages start straight with content. */
export function MobileHeader({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-background/95 px-3 md:hidden">
      <SidebarTrigger className="text-ash-gray" />
      <span className="text-ui text-bone-white">{title}</span>
    </header>
  )
}

import { BrandMark } from "./brand-mark"

/** Phones get a slim title bar (the bottom bar has the places); desktop pages start with content. */
export function MobileHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-2.5 bg-background/95 px-4 md:hidden">
      <BrandMark small className="size-4.5" />
      <span className="min-w-0 flex-1 truncate font-display text-[17px] font-extrabold lowercase">
        {title}
      </span>
      {children}
    </header>
  )
}

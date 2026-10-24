/** Phones: the room's name on its wall, in the wall's ink (the places bar is above, the rail below). */
export function MobileHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="flex items-end gap-2.5 px-4 pt-3 pb-2 md:hidden">
      <h1 className="min-w-0 flex-1 truncate font-display text-[2.4rem] leading-[0.95] font-extrabold tracking-[-0.03em] lowercase text-(--space-heading-color)">
        {title}
      </h1>
      {children}
    </header>
  )
}

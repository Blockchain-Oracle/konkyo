import { APP } from "@konkyo/config"
import { cn } from "@konkyo/ui/lib/utils"

/** The mark's two cuts (64-unit grid): `small` has heavier strokes that stay legible at 16–24px. */
const SMALL = (
  <>
    <rect x="4" y="15" width="56" height="9" />
    <rect x="27.5" y="3" width="9" height="57" />
    <polygon points="24,29 24,36 10,60 0,60" />
    <polygon points="40,29 40,36 54,60 64,60" />
  </>
)
const LARGE = (
  <>
    <rect x="6" y="18" width="52" height="6" />
    <rect x="29" y="5" width="6" height="53" />
    <polygon points="26,28 26,33 8,58 1,58" />
    <polygon points="38,28 38,33 56,58 63,58" />
  </>
)

/** The mark's shapes alone, for any SVG that draws it (the OG images too). */
export function MarkShapes({ small = false }: { small?: boolean }) {
  return small ? SMALL : LARGE
}

/**
 * The Konkyo mark: 木, the "tree/root" radical of 根 (the first character of 根拠, "grounds").
 * Lime by default (plan §16.4: lime is the brand pop); it takes `currentColor`, so a class can
 * recolour it. Inline so it inherits sizing and needs no request.
 */
export function BrandMark({ className, small = false }: { className?: string; small?: boolean }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("text-lime", className)}
      aria-hidden
      focusable="false"
      fill="currentColor"
    >
      {small ? SMALL : LARGE}
    </svg>
  )
}

/** The mark with the lowercase wordmark in Bricolage 800 (OurSpaces' "ourspaces" lockup). */
export function BrandLockup({
  className,
  markClassName,
}: {
  className?: string
  markClassName?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-display text-[22px] leading-none font-extrabold tracking-[-0.03em] text-white",
        className,
      )}
    >
      <BrandMark small className={cn("size-[0.95em]", markClassName)} />
      {APP.name.toLowerCase()}
    </span>
  )
}

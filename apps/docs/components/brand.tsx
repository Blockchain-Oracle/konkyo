/** The Konkyo mark (木) in lime and the lowercase wordmark, as on the landing, with a docs pill. */
export function Brand() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 64 64" className="size-[22px] text-lime" fill="currentColor" aria-hidden>
        <rect x="4" y="15" width="56" height="9" />
        <rect x="27.5" y="3" width="9" height="57" />
        <polygon points="24,29 24,36 10,60 0,60" />
        <polygon points="40,29 40,36 54,60 64,60" />
      </svg>
      <span className="font-display text-[21px] leading-none font-extrabold tracking-[-0.03em] text-fd-foreground">
        konkyo
      </span>
      <span className="rounded-full border border-fd-border px-2 py-0.5 text-[11px] font-medium text-fd-muted-foreground">
        docs
      </span>
    </span>
  )
}

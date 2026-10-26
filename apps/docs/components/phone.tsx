import type { ReactNode } from "react"

/*
 * A real screen from the app in a phone: a bezel round a rounded screen and an island in a
 * status bar sized from the width, so it never covers the capture's own header.
 */

const FRAME = "linear-gradient(135deg, #24262b 0%, #1c1e22 40%, #18191d 100%)"

/** Every phone capture in public/shots/phone is 390 × 844 at 2x. */
const SCREEN_RATIO = "aspect-[390/844]"

export function Phone({
  src,
  alt,
  caption,
  eager = false,
  className = "",
}: {
  src: string
  alt: string
  caption?: ReactNode
  /** Above the fold: load at once instead of when scrolled near. */
  eager?: boolean
  className?: string
}) {
  return (
    <figure className={`not-prose m-0 flex flex-col items-center gap-3 ${className}`}>
      <div
        className="relative w-full max-w-[17rem] rounded-[3.1rem] p-[3.2%] shadow-[0_24px_60px_-18px_rgb(0_0_0/0.6),0_2px_6px_rgb(0_0_0/0.3)]"
        style={{ background: FRAME }}
      >
        <div className="relative overflow-hidden rounded-[2.75rem] bg-black shadow-[inset_0_0_0_1px_rgb(255_255_255/0.04)]">
          <div aria-hidden className="flex aspect-[100/12] items-center justify-center">
            <span className="h-[52%] w-[31%] rounded-full bg-[#050505] ring-1 ring-white/5" />
          </div>
          {/* biome-ignore lint/performance/noImgElement: a static export; the file is pre-sized */}
          <img
            src={src}
            alt={alt}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            className={`block w-full object-cover object-top ${SCREEN_RATIO}`}
          />
        </div>
      </div>
      {caption ? (
        <figcaption className="max-w-[17rem] text-center text-[13px] leading-snug text-fd-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  )
}

/** Phones side by side; on a phone they scroll sideways instead of shrinking to nothing. */
export function Phones({ children }: { children: ReactNode }) {
  return (
    <div className="not-prose -mx-4 my-8 overflow-x-auto px-4 [scrollbar-width:none]">
      <div className="grid min-w-[36rem] auto-cols-fr grid-flow-col gap-5 sm:min-w-0">
        {children}
      </div>
    </div>
  )
}

/** A wide capture of the app (desktop at 1920 × 1080), framed like a window; click to zoom. */
export function Shot({
  src,
  alt,
  caption,
  path = "konkyo.xyz",
  eager = false,
}: {
  src: string
  alt: string
  caption?: ReactNode
  /** The address the window shows. */
  path?: string
  eager?: boolean
}) {
  return (
    <figure className="not-prose my-8">
      <a
        href={src}
        title="Open full size"
        className="block overflow-hidden rounded-[14px] border border-fd-border bg-black shadow-[0_18px_50px_-24px_rgb(0_0_0/0.7)] transition-transform hover:-translate-y-0.5"
      >
        <div className="flex h-7 items-center gap-1.5 border-b border-white/10 bg-[#131315] px-3">
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="ms-3 truncate font-mono text-[11px] text-white/45">{path}</span>
        </div>
        {/* biome-ignore lint/performance/noImgElement: a static export; the file is pre-sized */}
        <img
          src={src}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          className="block h-auto w-full"
        />
      </a>
      {caption ? (
        <figcaption className="mt-3 text-center text-[13px] text-fd-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  )
}

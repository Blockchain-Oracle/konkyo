import { ArrowUpRight } from "lucide-react"
import Link from "next/link"

/*
 * A feature tile on the front page: the card holds a real capture of the app, the words lift on
 * hover and a "Read" line rises into view. A phone capture peeks up from the bottom in its frame,
 * a desktop capture sits flush like a window.
 */

export function Tile({
  title,
  line,
  href,
  src,
  alt,
  kind,
  tall = false,
  className = "",
}: {
  title: string
  line: string
  href: string
  src: string
  alt: string
  kind: "phone" | "wide"
  /** Spans two rows: the capture takes all the room it's given. */
  tall?: boolean
  className?: string
}) {
  return (
    <Link
      href={href}
      className={`group relative flex min-h-[19rem] flex-col overflow-hidden rounded-[22px] border border-fd-border bg-fd-card transition-[border-color,box-shadow] duration-300 hover:border-lime/60 hover:shadow-[0_20px_50px_-30px_rgb(0_0_0/0.45)] ${className}`}
    >
      <div className="relative z-10 flex flex-col gap-1.5 p-6 transition-transform duration-300 ease-out group-hover:-translate-y-1">
        <h3 className="font-display text-[1.35rem] leading-tight font-extrabold tracking-[-0.02em]">
          {title}
        </h3>
        <p className="max-w-[34ch] text-[14.5px] leading-snug text-fd-muted-foreground">{line}</p>
        <span className="mt-1 inline-flex translate-y-1 items-center gap-1 text-[13px] font-semibold opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          Read <ArrowUpRight className="size-3.5" />
        </span>
      </div>
      {kind === "phone" ? (
        <div
          className={`relative mt-auto flex justify-center overflow-hidden px-6 ${tall ? "min-h-[18rem] flex-1" : "h-[15rem]"}`}
        >
          <div
            className={`absolute w-[62%] max-w-[15rem] ${tall ? "bottom-0 translate-y-12" : "top-2 translate-y-4"} rounded-t-[2.2rem] bg-[#1c1e22] p-[2.6%] pb-0 shadow-[0_-10px_40px_-18px_rgb(0_0_0/0.5)] transition-transform duration-500 ease-out group-hover:translate-y-0`}
          >
            <div className="overflow-hidden rounded-t-[1.9rem] bg-black pt-[9%]">
              {/* biome-ignore lint/performance/noImgElement: a static export; the file is pre-sized */}
              <img
                src={src}
                alt={alt}
                loading="lazy"
                decoding="async"
                className="block aspect-[390/844] w-full object-cover object-top"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="relative mt-auto max-h-[19rem] overflow-hidden ps-6">
          <div className="translate-x-3 translate-y-3 overflow-hidden rounded-tl-[14px] border-t border-l border-fd-border bg-black transition-transform duration-500 ease-out group-hover:translate-x-1 group-hover:translate-y-1">
            {/* biome-ignore lint/performance/noImgElement: a static export; the file is pre-sized */}
            <img
              src={src}
              alt={alt}
              loading="lazy"
              decoding="async"
              className="block h-auto w-full"
            />
          </div>
        </div>
      )}
    </Link>
  )
}

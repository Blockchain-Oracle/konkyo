import { APP } from "@konkyo/config"
import Link from "next/link"
import type { ReactNode } from "react"
import { BrandMark } from "@/components/brand-mark"

/**
 * The 404 and error pages (plan §16.8, system pages): a black page, a paper sticker with what
 * happened, one big lowercase line, one sentence, and one lime way on. The mark leads home.
 */
export function SystemPage({
  sticker,
  title,
  children,
  action,
}: {
  /** The tilted paper sticker: "404", "hiccup". */
  sticker: string
  title: string
  children: ReactNode
  /** The one lime action. */
  action: ReactNode
}) {
  return (
    <main className="system-page">
      <Link href="/" className="system-brand">
        <BrandMark small className="size-5" />
        {APP.name.toLowerCase()}
      </Link>
      <div className="system-body">
        <span className="system-sticker" aria-hidden="true">
          {sticker}
        </span>
        <h1>{title}</h1>
        <p>{children}</p>
        {action}
      </div>
    </main>
  )
}

import { APP } from "@konkyo/config"
import Link from "next/link"
import type { ReactNode } from "react"
import { BrandMark } from "@/components/brand-mark"

/**
 * The 404, error and offline pages (plan §8): Dala's amber label, one plain headline, one
 * sentence, and one way back.
 */
export function SystemPage({
  label,
  title,
  children,
  actions,
}: {
  label: string
  title: string
  children: ReactNode
  actions: ReactNode
}) {
  return (
    <main className="grid min-h-svh place-items-center px-6 py-15">
      <div className="w-full max-w-[30rem]">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-nav-label font-semibold text-bone-white uppercase"
        >
          <BrandMark small className="size-5" />
          {APP.name}
        </Link>
        <p className="mt-15 text-micro text-saffron-spark uppercase">{label}</p>
        <h1 className="mt-3 text-subheading font-normal text-balance">{title}</h1>
        <p className="mt-4.5 text-body font-extralight text-pretty text-bone-white">{children}</p>
        <div className="mt-9 flex flex-wrap gap-3">{actions}</div>
      </div>
    </main>
  )
}

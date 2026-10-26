import { HomeLayout } from "fumadocs-ui/layouts/home"
import Link from "next/link"
import { homeOptions } from "@/lib/layout.shared"
import { DOCS } from "@/lib/site"

/** A missing page (exported as 404.html, which nginx serves for anything it can't find). */
export default function NotFound() {
  return (
    <HomeLayout {...homeOptions()}>
      <main className="flex flex-1 flex-col items-center justify-center gap-5 px-4 py-24 text-center">
        <span className="grid size-20 rotate-[-6deg] place-items-center rounded-full border-4 border-[#e23b2e] font-display text-[26px] leading-none font-extrabold text-[#e23b2e]">
          根拠
        </span>
        <h1 className="font-display text-4xl font-extrabold tracking-[-0.03em]">
          No grounds here.
        </h1>
        <p className="max-w-sm text-fd-muted-foreground">
          This page moved or never existed. The docs start with the guide.
        </p>
        <Link
          href={DOCS.guide}
          className="inline-flex h-11 items-center rounded-full bg-lime px-5 text-[14px] font-semibold text-ink"
        >
          Go to the guide
        </Link>
      </main>
    </HomeLayout>
  )
}

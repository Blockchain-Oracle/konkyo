import { APP } from "@konkyo/config"
import Link from "next/link"
import { BrandMark } from "@/components/brand-mark"

/** Privacy and terms: read on paper (R4), on a clean wall, the mark leading home. */
export default function LegalLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="paper-bg space-theme-white min-h-svh">
      <div className="mx-auto w-full max-w-[50rem] px-4 pt-6 pb-20 md:px-8">
        <Link href="/" className="room-pill hover:bg-ink">
          <BrandMark small className="size-4" />
          {APP.name.toLowerCase()}
        </Link>
        <article className="surface-paper paper-sheet legal-sheet mt-8">{children}</article>
      </div>
    </div>
  )
}

import { APP } from "@konkyo/config"
import Link from "next/link"
import { BrandMark } from "@/components/brand-mark"

export default function LegalLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="mx-auto w-full max-w-[44rem] px-6 py-15">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-nav-label font-semibold uppercase"
      >
        <BrandMark small className="size-5" />
        {APP.name}
      </Link>
      <article className="mt-15 text-reading text-silver-mist [&_h1]:text-subheading [&_h1]:font-normal [&_h1]:text-bone-white [&_h2]:mt-9 [&_h2]:text-subhead [&_h2]:text-bone-white [&_li]:mt-1.5 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </article>
    </div>
  )
}

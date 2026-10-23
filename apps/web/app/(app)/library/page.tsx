import type { Metadata } from "next"
import { LibraryView } from "@/components/library/library-view"
import { MobileHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "Library" }

export default function LibraryPage() {
  return (
    <>
      <MobileHeader title="Library" />
      <div className="mx-auto w-full max-w-5xl px-6 pt-9 pb-24 md:pt-15">
        <LibraryView />
      </div>
    </>
  )
}

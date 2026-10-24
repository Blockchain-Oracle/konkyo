import type { Metadata } from "next"
import { LibraryView } from "@/components/library/library-view"

export const metadata: Metadata = { title: "Library" }

export default function LibraryPage() {
  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pt-4 pb-28 md:px-8 md:pt-[92px]">
      <LibraryView />
    </div>
  )
}

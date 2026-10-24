import type { Metadata } from "next"
import { Suspense } from "react"
import { LibraryView } from "@/components/library/library-view"

export const metadata: Metadata = { title: "Space" }

/** A space (a top-level folder): its wall of sources, or the same files as a list (plan F46). */
export default async function SpacePage({ params }: PageProps<"/spaces/[id]">) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 pt-4 pb-28 md:px-8 md:pt-[92px]">
      <Suspense>
        <LibraryView folderId={id} space />
      </Suspense>
    </div>
  )
}

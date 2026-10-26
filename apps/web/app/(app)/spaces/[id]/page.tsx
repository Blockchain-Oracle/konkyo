import type { Metadata } from "next"
import { Suspense } from "react"
import { LibraryView } from "@/components/library/library-view"

export const metadata: Metadata = { title: "Space" }

/** The id is URL data: it is read inside the boundary, so navigation stays instant. */
async function Space({ params }: { params: PageProps<"/spaces/[id]">["params"] }) {
  const { id } = await params
  return <LibraryView folderId={id} space />
}

/** A space (a top-level folder): its wall of sources, or the same files as a list. */
export default function SpacePage({ params }: PageProps<"/spaces/[id]">) {
  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 pt-4 pb-28 md:px-8 md:pt-[92px]">
      <Suspense>
        <Space params={params} />
      </Suspense>
    </div>
  )
}

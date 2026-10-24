import type { Metadata } from "next"
import { Suspense } from "react"
import { LibraryView } from "@/components/library/library-view"

export const metadata: Metadata = { title: "Folder" }

/** The id is URL data: it is read inside the boundary, so navigation stays instant. */
async function Folder({ params }: { params: PageProps<"/library/folders/[id]">["params"] }) {
  const { id } = await params
  return <LibraryView folderId={id} />
}

export default function FolderPage({ params }: PageProps<"/library/folders/[id]">) {
  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pt-4 pb-28 md:px-8 md:pt-[92px]">
      <Suspense>
        <Folder params={params} />
      </Suspense>
    </div>
  )
}

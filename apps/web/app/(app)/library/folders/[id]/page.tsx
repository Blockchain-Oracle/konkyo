import type { Metadata } from "next"
import { Suspense } from "react"
import { LibraryView } from "@/components/library/library-view"

export const metadata: Metadata = { title: "Folder" }

export default async function FolderPage({ params }: PageProps<"/library/folders/[id]">) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pt-4 pb-28 md:px-8 md:pt-[92px]">
      <Suspense>
        <LibraryView folderId={id} />
      </Suspense>
    </div>
  )
}

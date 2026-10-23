import type { Metadata } from "next"
import { LibraryView } from "@/components/library/library-view"
import { MobileHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "Folder" }

export default async function FolderPage({ params }: PageProps<"/library/folders/[id]">) {
  const { id } = await params
  return (
    <>
      <MobileHeader title="Folder" />
      <div className="mx-auto w-full max-w-5xl px-6 pt-9 pb-24 md:pt-15">
        <LibraryView folderId={id} />
      </div>
    </>
  )
}

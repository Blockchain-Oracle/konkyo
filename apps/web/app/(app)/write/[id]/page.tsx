import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { NoteEditorLoader } from "@/components/write/note-editor-loader"
import { NoteReader } from "@/components/write/note-reader"
import { LibraryError } from "@/lib/library"
import { getNote, readNote } from "@/lib/notes"
import { getSession } from "@/lib/session"

export const metadata: Metadata = { title: "Write" }

async function Note({ params }: { params: PageProps<"/write/[id]">["params"] }) {
  const { id } = await params
  const session = await getSession()
  if (!session) notFound()
  try {
    return <NoteEditorLoader note={await getNote(session.user.id, id)} />
  } catch (error) {
    if (!(error instanceof LibraryError)) throw error
  }
  // not yours: someone else's note in a space you're in reads on paper, unchanged
  try {
    return <NoteReader note={await readNote(session.user.id, id)} />
  } catch (error) {
    if (error instanceof LibraryError) notFound()
    throw error
  }
}

/** One note (plan F21): the id is URL data, read inside the boundary. */
export default function NotePage({ params }: PageProps<"/write/[id]">) {
  return (
    <Suspense fallback={null}>
      <Note params={params} />
    </Suspense>
  )
}

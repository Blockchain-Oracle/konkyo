"use client"

import { Skeleton } from "@konkyo/ui/components/skeleton"
import dynamic from "next/dynamic"
import type { NoteDetail } from "@/lib/notes"

/** The editor shell paints at once; Tiptap loads in the browser only. */
const NoteEditor = dynamic(() => import("./note-editor").then((m) => m.NoteEditor), {
  ssr: false,
  loading: () => (
    <div className="mx-auto w-full max-w-[68ch] space-y-4 px-6 pt-22" aria-hidden>
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  ),
})

export function NoteEditorLoader({ note }: { note: NoteDetail }) {
  return <NoteEditor note={note} />
}

"use client"

import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { PageShell } from "@/components/page-shell"
import type { SharedNote } from "@/lib/notes"
import { Citation } from "./citation-node"

/**
 * A note someone else wrote, filed in a space you're in (plan F56): on paper, read-only, its
 * citations as they are. Editing, history and checks stay with its author.
 */
export function NoteReader({ note }: { note: SharedNote }) {
  const editor = useEditor({
    extensions: [StarterKit, Citation],
    content: note.content as object,
    editable: false,
    immediatelyRender: false,
    editorProps: { attributes: { class: "note-prose" } },
  })
  return (
    <PageShell
      title={note.title || "untitled"}
      kicker={`a note by ${note.author.toLowerCase()} · read only`}
    >
      <article aria-label={note.title}>
        <EditorContent editor={editor} />
      </article>
    </PageShell>
  )
}

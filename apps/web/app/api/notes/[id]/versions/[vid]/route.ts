import { z } from "zod"
import { route } from "@/lib/api"
import { docText } from "@/lib/export-note"
import { getNote, getVersion } from "@/lib/notes"

/** A version's content for its preview, and its words beside the note's now (what changed). */
export const GET = route<{ id: string; vid: string }>(async ({ userId, params }) => {
  const noteId = z.uuid().parse(params.id)
  const [version, note] = await Promise.all([
    getVersion(userId, noteId, z.uuid().parse(params.vid)),
    getNote(userId, noteId),
  ])
  return { ...version, text: docText(version.content), now: docText(note.content) }
})

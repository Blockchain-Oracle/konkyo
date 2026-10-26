import "server-only"
import { randomUUID } from "node:crypto"
import type { KonkyoMessage } from "@konkyo/agents"
import { STARTERS } from "@konkyo/config"
import { startDeep } from "./deep"
import { createFolder } from "./folders"
import { importUrl } from "./library"
import { createNote } from "./notes"
import { markOnboarded } from "./settings"

export type StarterPath = keyof typeof STARTERS

/**
 * Runs a starter for real: Study imports a sample course into a folder (Quiz me
 * starts once it's read); Research runs a deep search that imports and answers; Write imports
 * three papers and opens an essay note beside them. First run is over either way.
 */
export async function runStarter(ownerId: string, path: StarterPath) {
  if (path === "research") {
    const chatId = randomUUID()
    const question = STARTERS.research.question
    const userMessage = {
      id: randomUUID(),
      role: "user",
      parts: [{ type: "text", text: question }],
    } as KonkyoMessage
    await startDeep(ownerId, { chatId, question, userMessage, autoImport: true })
    await markOnboarded(ownerId)
    return { path, chatId }
  }
  const pack = STARTERS[path]
  const folder = await createFolder(ownerId, pack.folder)
  for (const file of pack.files)
    await importUrl(ownerId, file.url, folder.id, {
      title: "title" in file ? file.title : undefined,
      meta: { licence: file.licence },
    })
  await markOnboarded(ownerId)
  if (path === "study") return { path, folderId: folder.id }
  // Headings to write under, each with what goes there in italics (the person writes over it).
  const { note: starter } = STARTERS.write
  const nodes = [
    { type: "paragraph", content: [{ type: "text", text: starter.intro }] },
    ...starter.sections.flatMap(([heading, hint]) => [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: heading }] },
      { type: "paragraph", content: [{ type: "text", marks: [{ type: "italic" }], text: hint }] },
    ]),
  ]
  const note = await createNote(ownerId, {
    title: starter.title,
    folderId: folder.id,
    content: { type: "doc", content: nodes },
    text: [starter.intro, ...starter.sections.flat()].join("\n"),
  })
  return { path, folderId: folder.id, noteId: note.id }
}

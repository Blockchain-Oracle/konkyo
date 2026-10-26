import "server-only"
import { createHash } from "node:crypto"
import { NOTES, type SpaceColor } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { fileAccess } from "@konkyo/db/access"
import { enqueueDebounced } from "@konkyo/jobs"
import { and, desc, eq, isNull, sql } from "drizzle-orm"
import { fileableFolder, LibraryError } from "./library"

const { files, fileFolders, notes, noteVersions, noteEvents } = schema

/** A Tiptap (ProseMirror) document. */
export type NoteDoc = { type: "doc"; content?: unknown[] }

export const EMPTY_DOC: NoteDoc = { type: "doc", content: [{ type: "paragraph" }] }

/** A new note, in a folder if one is given; it's a file, so it's in the library too. */
export async function createNote(
  ownerId: string,
  input: { title?: string; folderId?: string; content?: NoteDoc; text?: string },
) {
  // yours, or a shared space where you can add (the note stays yours)
  if (input.folderId) await fileableFolder(ownerId, input.folderId)
  return db.transaction(async (tx) => {
    const [file] = await tx
      .insert(files)
      .values({
        ownerId,
        title: input.title?.trim() || "Untitled note",
        kind: "note",
        status: "ready",
        stage: null,
        progress: 1,
      })
      .returning({ id: files.id })
    if (!file) throw new LibraryError("Couldn't create the note", 500)
    const text = input.text ?? ""
    await tx.insert(notes).values({
      fileId: file.id,
      ownerId,
      content: input.content ?? EMPTY_DOC,
      text,
      words: wordCount(text),
    })
    if (input.folderId)
      await tx.insert(fileFolders).values({ fileId: file.id, folderId: input.folderId })
    return { id: file.id }
  })
}

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length

async function ownNote(ownerId: string, fileId: string) {
  const file = await db.query.files.findFirst({
    where: and(
      eq(files.id, fileId),
      eq(files.ownerId, ownerId),
      eq(files.kind, "note"),
      isNull(files.deletedAt),
    ),
  })
  if (!file) throw new LibraryError("No such note", 404)
  return file
}

/**
 * The space a note is filed in, as its card and its editor show it. The outer file is named in
 * full: Drizzle writes `files.id` as a bare "id" in a one-table select, which inside this
 * subquery is ambiguous (folders have ids too) and broke every note's editor (in testing).
 */
const spaceOfNote = (ownerId: string) =>
  sql<{ id: string; name: string; color: SpaceColor | null } | null>`(
    select json_build_object('id', s.id, 'name', s.name, 'color', s.color)
    from file_folders ff join folders fo on fo.id = ff.folder_id
    join folders s on s.id = fo.space_id
    where ff.file_id = "files"."id" and s.deleted_at is null and fo.deleted_at is null
      -- only a space this person is still in (a note can stay filed in one they left)
      and (s.owner_id = ${ownerId} or exists (select 1 from space_members m
        where m.space_id = s.id and m.user_id = ${ownerId}))
    order by ff.added_at limit 1)`

export async function getNote(ownerId: string, fileId: string) {
  const file = await ownNote(ownerId, fileId)
  const note = await db.query.notes.findFirst({ where: eq(notes.fileId, fileId) })
  const [filed] = await db
    .select({ space: spaceOfNote(ownerId) })
    .from(files)
    .where(eq(files.id, fileId))
  return {
    id: file.id,
    title: file.title,
    content: (note?.content ?? EMPTY_DOC) as NoteDoc,
    words: note?.words ?? 0,
    updatedAt: (note?.updatedAt ?? file.updatedAt).toISOString(),
    space: filed?.space ?? null,
  }
}

export type NoteDetail = Awaited<ReturnType<typeof getNote>>

/**
 * Someone else's note filed in a space you're in: read-only, with who wrote it. Its
 * history, autosave and checks stay its author's.
 */
export async function readNote(userId: string, fileId: string) {
  const access = await fileAccess(userId, fileId)
  const file = access
    ? await db.query.files.findFirst({
        where: and(eq(files.id, fileId), eq(files.kind, "note"), isNull(files.deletedAt)),
      })
    : undefined
  if (!access || !file) throw new LibraryError("No such note", 404)
  const [note, author] = await Promise.all([
    db.query.notes.findFirst({ where: eq(notes.fileId, fileId) }),
    db.query.user.findFirst({ where: eq(schema.user.id, file.ownerId) }),
  ])
  return {
    id: file.id,
    title: file.title,
    content: (note?.content ?? EMPTY_DOC) as NoteDoc,
    words: note?.words ?? 0,
    updatedAt: (note?.updatedAt ?? file.updatedAt).toISOString(),
    author: author?.name ?? "someone",
  }
}

export type SharedNote = Awaited<ReturnType<typeof readNote>>

/**
 * Autosave (F24). The text is re-read for chat once typing pauses, and a version is kept when
 * the last one is older than ten minutes, so the history groups a session's edits.
 */
export async function saveNote(
  ownerId: string,
  fileId: string,
  input: { title?: string; content?: NoteDoc; text?: string },
) {
  await ownNote(ownerId, fileId)
  const now = new Date()
  const words = input.text != null ? wordCount(input.text) : undefined
  await db.transaction(async (tx) => {
    if (input.title != null)
      await tx
        .update(files)
        .set({ title: input.title.trim().slice(0, 300) || "Untitled note" })
        .where(eq(files.id, fileId))
    if (input.content) {
      await tx
        .update(notes)
        .set({
          content: input.content,
          ...(input.text != null ? { text: input.text, words } : {}),
          updatedAt: now,
        })
        .where(eq(notes.fileId, fileId))
      const [last] = await tx
        .select({ createdAt: noteVersions.createdAt })
        .from(noteVersions)
        .where(eq(noteVersions.fileId, fileId))
        .orderBy(desc(noteVersions.createdAt))
        .limit(1)
      if (!last || now.getTime() - last.createdAt.getTime() > NOTES.versionEveryMs)
        await tx
          .insert(noteVersions)
          .values({ fileId, ownerId, content: input.content, words: words ?? 0, auto: true })
    }
  })
  if (input.text != null)
    await enqueueDebounced("noteIndex", { fileId }, Math.round(NOTES.indexAfterMs / 1000), fileId)
  return { savedAt: now.toISOString() }
}

export async function listVersions(ownerId: string, fileId: string) {
  await ownNote(ownerId, fileId)
  const rows = await db
    .select({
      id: noteVersions.id,
      name: noteVersions.name,
      auto: noteVersions.auto,
      words: noteVersions.words,
      createdAt: noteVersions.createdAt,
    })
    .from(noteVersions)
    .where(eq(noteVersions.fileId, fileId))
    .orderBy(desc(noteVersions.createdAt))
    .limit(200)
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))
}

export async function getVersion(ownerId: string, fileId: string, versionId: string) {
  await ownNote(ownerId, fileId)
  const row = await db.query.noteVersions.findFirst({
    where: and(eq(noteVersions.id, versionId), eq(noteVersions.fileId, fileId)),
  })
  if (!row) throw new LibraryError("No such version", 404)
  return { id: row.id, name: row.name, content: row.content as NoteDoc, createdAt: row.createdAt }
}

/** "Save version": the current text, with a name. */
export async function nameVersion(ownerId: string, fileId: string, name: string) {
  await ownNote(ownerId, fileId)
  const note = await db.query.notes.findFirst({ where: eq(notes.fileId, fileId) })
  if (!note) throw new LibraryError("No such note", 404)
  const [row] = await db
    .insert(noteVersions)
    .values({
      fileId,
      ownerId,
      content: note.content,
      words: note.words,
      name: name.trim().slice(0, 120),
      auto: false,
    })
    .returning({ id: noteVersions.id })
  return { id: row?.id }
}

/** Restore keeps what's there first, as its own version, so a restore can be undone. */
export async function restoreVersion(ownerId: string, fileId: string, versionId: string) {
  const version = await getVersion(ownerId, fileId, versionId)
  const note = await db.query.notes.findFirst({ where: eq(notes.fileId, fileId) })
  if (!note) throw new LibraryError("No such note", 404)
  await db.insert(noteVersions).values({
    fileId,
    ownerId,
    content: note.content,
    words: note.words,
    name: "Before restoring",
    auto: false,
  })
  await logNoteEvent(ownerId, fileId, "restored", {
    versionId,
    name: version.name,
    from: version.createdAt.toISOString(),
  })
  return { content: version.content }
}

/** One AI action on the draft, for the process record (F25). */
/**
 * What a "Check my draft" checked, as a hash of its words (spacing ignored): publishing counts a
 * check only when it matches the note as saved.
 */
export const textHash = (text: string) =>
  createHash("sha256").update(text.replace(/\s+/g, " ").trim()).digest("hex")

export async function logNoteEvent(
  ownerId: string,
  fileId: string,
  type: string,
  data: Record<string, unknown>,
) {
  await db.insert(noteEvents).values({ fileId, ownerId, type, data })
}

export async function listNoteEvents(ownerId: string, fileId: string) {
  await ownNote(ownerId, fileId)
  const rows = await db
    .select()
    .from(noteEvents)
    .where(eq(noteEvents.fileId, fileId))
    .orderBy(noteEvents.createdAt)
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    data: r.data as Record<string, unknown>,
    createdAt: r.createdAt.toISOString(),
  }))
}

/** The Write page's list: notes, newest edit first. */
export async function listNotes(ownerId: string) {
  const rows = await db
    .select({
      id: files.id,
      title: files.title,
      words: notes.words,
      updatedAt: notes.updatedAt,
      text: notes.text,
      // on the card: whether it's out as an article, and the space it's filed in
      published: sql<boolean>`exists (select 1 from articles a
        where a.note_file_id = ${files.id} and a.unpublished_at is null)`,
      space: spaceOfNote(ownerId),
    })
    .from(files)
    .innerJoin(notes, eq(notes.fileId, files.id))
    .where(and(eq(files.ownerId, ownerId), eq(files.kind, "note"), isNull(files.deletedAt)))
    .orderBy(desc(notes.updatedAt))
    .limit(200)
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    words: r.words,
    updatedAt: r.updatedAt.toISOString(),
    excerpt: r.text.replace(/\s+/g, " ").slice(0, 160),
    published: r.published,
    space: r.space,
  }))
}

/**
 * "Save to note": an answer, with its citations, added to the end of a note. Its
 * text is re-read for chat like any edit.
 */
export async function appendToNote(
  ownerId: string,
  fileId: string,
  input: { content: unknown[]; text: string },
) {
  await ownNote(ownerId, fileId)
  const note = await db.query.notes.findFirst({ where: eq(notes.fileId, fileId) })
  if (!note) throw new LibraryError("No such note", 404)
  const doc = note.content as NoteDoc
  // An empty first paragraph (a new note) is replaced rather than kept above the answer.
  const existing = (doc.content ?? []).filter(
    (n, _i, all) => !(all.length === 1 && (n as { content?: unknown[] }).content == null),
  )
  const text = [note.text.trim(), input.text.trim()].filter(Boolean).join("\n\n")
  await saveNote(ownerId, fileId, {
    content: { type: "doc", content: [...existing, ...input.content] },
    text,
  })
}

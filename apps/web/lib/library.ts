import "server-only"
import {
  type CslItem,
  type FileKind,
  type FileMeta,
  isYouTube,
  kindForName,
  STORAGE,
} from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { enqueue } from "@konkyo/jobs"
import { headObject, objectKey, presignOperation, type S3Operation } from "@konkyo/storage"
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { allowanceLeft } from "./usage"

const { files, folders, fileFolders, passages } = schema

export class LibraryError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message)
  }
}

/**
 * What the library list shows for each file (no internal storage keys), optionally only the files
 * filed in one folder. Each file carries its folder (the first one, if it is filed in several).
 */
export async function listFiles(ownerId: string, folderId?: string) {
  const firstFolder = db
    .selectDistinctOn([fileFolders.fileId], {
      fileId: fileFolders.fileId,
      folderId: fileFolders.folderId,
      folderName: folders.name,
    })
    .from(fileFolders)
    .innerJoin(folders, and(eq(folders.id, fileFolders.folderId), isNull(folders.deletedAt)))
    .orderBy(fileFolders.fileId, asc(fileFolders.addedAt))
    .as("first_folder")
  const rows = await db
    .select({
      id: files.id,
      title: files.title,
      kind: files.kind,
      status: files.status,
      stage: files.stage,
      progress: files.progress,
      problem: files.problem,
      problemDetail: files.problemDetail,
      fromScan: files.fromScan,
      pageCount: files.pageCount,
      durationSeconds: files.durationSeconds,
      sizeBytes: files.sizeBytes,
      sourceUrl: files.sourceUrl,
      // page one / og:image / video still, made by the worker's thumb job (/api/files/:id/thumb)
      hasThumb: sql<boolean>`${files.thumbKey} is not null`,
      createdAt: files.createdAt,
      updatedAt: files.updatedAt,
      folderId: firstFolder.folderId,
      folderName: firstFolder.folderName,
    })
    .from(files)
    .leftJoin(firstFolder, eq(firstFolder.fileId, files.id))
    .where(
      and(
        eq(files.ownerId, ownerId),
        isNull(files.deletedAt),
        folderId
          ? inArray(
              files.id,
              db
                .select({ id: fileFolders.fileId })
                .from(fileFolders)
                .where(eq(fileFolders.folderId, folderId)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(files.createdAt))
  // Every part of an upload is signed fresh, so an upload with no signature for longer than one
  // URL's lifetime has stopped (tab closed, connection lost): say so instead of "Uploading" forever.
  const stalledBefore = Date.now() - STORAGE.presignExpirySeconds * 1000
  type Row = Omit<(typeof rows)[number], "updatedAt"> & { interrupted: boolean }
  return rows.map(({ updatedAt, ...row }): Row => {
    const interrupted = row.stage === "Uploading" && updatedAt.getTime() < stalledBefore
    return interrupted
      ? {
          ...row,
          interrupted,
          status: "needs_you",
          stage: null,
          problem: "failed",
          problemDetail: "The upload didn't finish. Upload the file again.",
        }
      : { ...row, interrupted }
  })
}

export type LibraryFile = Awaited<ReturnType<typeof listFiles>>[number]

/** Creates (or finds) the folder chain for an uploaded folder's path, returning the leaf. */
async function ensureFolderPath(ownerId: string, segments: string[]): Promise<string | null> {
  let parentId: string | null = null
  for (const name of segments) {
    const existing: typeof folders.$inferSelect | undefined = await db.query.folders.findFirst({
      where: and(
        eq(folders.ownerId, ownerId),
        eq(folders.name, name),
        parentId ? eq(folders.parentId, parentId) : isNull(folders.parentId),
        isNull(folders.deletedAt),
      ),
    })
    if (existing) {
      parentId = existing.id
      continue
    }
    const [created]: { id: string }[] = await db
      .insert(folders)
      .values({ ownerId, parentId, name })
      .returning({ id: folders.id })
    parentId = created?.id ?? null
  }
  return parentId
}

const safeName = (name: string) => name.replace(/[^\w.\- ]+/g, "_").slice(-120) || "file"

/**
 * Registers an upload before any bytes move: the file appears in the library at once ("Uploading"),
 * folder uploads recreate their folders, and the object key is fixed server-side.
 */
export async function registerUpload(
  ownerId: string,
  input: { name: string; size: number; type?: string; relativePath?: string; folderId?: string },
) {
  const limited = await allowanceLeft(ownerId, "files")
  if (limited) throw new LibraryError(limited, 429)
  if (input.folderId) await ownFolder(ownerId, input.folderId)
  const kind = kindForName(input.name)
  if (!kind) {
    // Shown in the library as "Unsupported" with Remove (plan F03), rather than vanishing.
    await db.insert(files).values({
      ownerId,
      title: input.name,
      kind: "text",
      sizeBytes: input.size,
      status: "needs_you",
      problem: "unsupported",
      problemDetail: `${input.name.slice(input.name.lastIndexOf("."))} files can't be read yet`,
    })
    return { fileId: null, key: null }
  }
  const segments = (input.relativePath ?? "").split("/").filter(Boolean).slice(0, -1)
  const folderId =
    input.folderId ?? (segments.length ? await ensureFolderPath(ownerId, segments) : null)
  const [file] = await db
    .insert(files)
    .values({
      ownerId,
      title: input.name,
      kind,
      mime: input.type || null,
      sizeBytes: input.size,
      status: "queued",
      stage: "Uploading",
      progress: 0,
    })
    .returning({ id: files.id })
  if (!file) throw new LibraryError("Couldn't add the file", 500)
  const key = objectKey("originals", ownerId, file.id, safeName(input.name))
  await db.update(files).set({ originalKey: key }).where(eq(files.id, file.id))
  if (folderId)
    await db.insert(fileFolders).values({ fileId: file.id, folderId }).onConflictDoNothing()
  return { fileId: file.id, key }
}

/** Presigns an S3 call only for a key this person registered and is still uploading. */
export async function signUpload(ownerId: string, op: S3Operation) {
  const file = await db.query.files.findFirst({
    where: and(eq(files.ownerId, ownerId), eq(files.originalKey, op.key)),
  })
  if (file?.stage !== "Uploading") throw new LibraryError("Not an upload of yours", 403)
  await db.update(files).set({ updatedAt: new Date() }).where(eq(files.id, file.id)) // still alive
  const url = await presignOperation(op, file.mime ?? undefined)
  // The URL is signed with Content-Type on single and create-multipart requests; Uppy must send
  // exactly that value or S3 rejects the signature.
  const signsType = file.mime && !op.uploadId && (op.method === "PUT" || op.method === "POST")
  return signsType ? { url, headers: { "content-type": file.mime as string } } : { url }
}

/** The bytes are in storage: queue the file for reading. */
export async function markUploaded(ownerId: string, fileId: string) {
  const file = await db.query.files.findFirst({
    where: and(eq(files.id, fileId), eq(files.ownerId, ownerId)),
  })
  if (!file?.originalKey) throw new LibraryError("No such upload", 404)
  const head = await headObject(file.originalKey)
  if (!head) throw new LibraryError("The upload didn't arrive; try again", 409)
  await db
    .update(files)
    .set({ sizeBytes: head.size, stage: "Waiting to be read", progress: 0 })
    .where(eq(files.id, fileId))
  await enqueue("ingest", { fileId }, fileId)
}

/**
 * A web page, paper link or YouTube video by URL. A starter pack (F39) also gives the file its
 * title and licence up front.
 */
export async function importUrl(
  ownerId: string,
  rawUrl: string,
  folderId?: string,
  known: { title?: string; meta?: FileMeta } = {},
) {
  let url: URL
  try {
    url = new URL(rawUrl.trim())
  } catch {
    throw new LibraryError("That isn't a web address")
  }
  if (!/^https?:$/.test(url.protocol))
    throw new LibraryError("Only http and https links can be imported")
  const limited = await allowanceLeft(ownerId, "files")
  if (limited) throw new LibraryError(limited, 429)
  if (folderId) await ownFolder(ownerId, folderId)
  const kind: FileKind = isYouTube(url.href) ? "youtube" : "web"
  const [file] = await db
    .insert(files)
    .values({
      ownerId,
      title: known.title ?? url.hostname + url.pathname,
      kind,
      sourceUrl: url.href,
      ...(known.meta ? { meta: known.meta } : {}),
      status: "queued",
      stage: "Waiting to be read",
    })
    .returning({ id: files.id })
  if (!file) throw new LibraryError("Couldn't add the link", 500)
  if (folderId)
    await db.insert(fileFolders).values({ fileId: file.id, folderId }).onConflictDoNothing()
  await enqueue("ingest", { fileId: file.id }, file.id)
  return { fileId: file.id }
}

/** The person's own folder, or a 404: every way a file is put in a folder checks this first. */
export async function ownFolder(ownerId: string, folderId: string) {
  const folder = await db.query.folders.findFirst({
    where: and(eq(folders.id, folderId), eq(folders.ownerId, ownerId), isNull(folders.deletedAt)),
  })
  if (!folder) throw new LibraryError("No such folder", 404)
  return folder
}

async function ownFile(ownerId: string, fileId: string) {
  const file = await db.query.files.findFirst({
    where: and(eq(files.id, fileId), eq(files.ownerId, ownerId)),
  })
  if (!file) throw new LibraryError("No such file", 404)
  return file
}

/** The person's own corrections to a file's title and citation record (plan F06). */
export async function editDetails(
  ownerId: string,
  fileId: string,
  edit: { title?: string; csl?: CslItem },
) {
  const file = await ownFile(ownerId, fileId)
  const meta = (file.meta ?? {}) as FileMeta
  await db
    .update(files)
    .set({
      title: edit.title?.trim() || file.title,
      meta: edit.csl ? { ...meta, csl: { ...meta.csl, ...edit.csl }, foundBy: "you" } : meta,
    })
    .where(eq(files.id, fileId))
}

/** "Try again" for a file that couldn't be processed or reached, and Re-process for any file. */
export async function retryFile(ownerId: string, fileId: string) {
  await ownFile(ownerId, fileId)
  await db
    .update(files)
    .set({
      status: "queued",
      stage: "Waiting to be read",
      progress: 0,
      problem: null,
      problemDetail: null,
    })
    .where(eq(files.id, fileId))
  await enqueue("ingest", { fileId }, fileId)
}

/** Duplicate: put the existing copy in this upload's folders, then drop the duplicate. */
export async function keepExisting(ownerId: string, fileId: string) {
  const dup = await ownFile(ownerId, fileId)
  if (dup.problem !== "duplicate" || !dup.duplicateOfId)
    throw new LibraryError("This file isn't a duplicate")
  const memberships = await db.select().from(fileFolders).where(eq(fileFolders.fileId, fileId))
  if (memberships.length) {
    await db
      .insert(fileFolders)
      .values(
        memberships.map((m) => ({ fileId: dup.duplicateOfId as string, folderId: m.folderId })),
      )
      .onConflictDoNothing()
  }
  await db.delete(files).where(eq(files.id, fileId))
  return { keptId: dup.duplicateOfId }
}

// ------------------------------------------------------------------ sources (the preview pane)

/** One file for the preview pane: where to read it (a PDF for every document kind) or play it. */
export async function getFileDetail(ownerId: string, fileId: string) {
  const file = await ownFile(ownerId, fileId)
  if (file.deletedAt) throw new LibraryError("This file is in Trash", 404)
  const playable = file.kind === "audio" || file.kind === "video"
  const content = `/api/files/${file.id}/content`
  return {
    id: file.id,
    title: file.title,
    kind: file.kind,
    status: file.status,
    mime: file.mime,
    sourceUrl: file.sourceUrl,
    pageCount: file.pageCount,
    durationSeconds: file.durationSeconds,
    fromScan: file.fromScan,
    pages: file.pages,
    sizeBytes: file.sizeBytes,
    meta: (file.meta ?? {}) as FileMeta,
    createdAt: file.createdAt,
    renditionUrl: file.renditionKey ? content : null,
    mediaUrl: playable && file.originalKey ? `${content}?as=original` : null,
    downloadUrl: file.originalKey ? `${content}?as=original&download=1` : null,
  }
}

export type FileDetail = Awaited<ReturnType<typeof getFileDetail>>

/**
 * A download's file name: the title, with the stored file's extension when the title lost it
 * (a found title replaces "arxiv-1711.05391.pdf" with the paper's name).
 */
export function downloadName(title: string, key: string) {
  const ext = key.match(/\.[a-z0-9]{2,5}$/i)?.[0] ?? ""
  return ext && !title.toLowerCase().endsWith(ext.toLowerCase()) ? `${title}${ext}` : title
}

/** The storage key behind a file's content route, only for its owner. */
export async function fileContentKey(
  ownerId: string,
  fileId: string,
  as: "rendition" | "original",
) {
  const file = await ownFile(ownerId, fileId)
  const key = as === "original" ? file.originalKey : file.renditionKey
  if (!key) throw new LibraryError("This file has no stored copy", 404)
  const name =
    as === "original"
      ? downloadName(file.title, key)
      : `${file.title.replace(/\.[a-z0-9]+$/i, "")}.pdf`
  return { key, name, mime: as === "original" ? file.mime : "application/pdf" }
}

const passageColumns = {
  id: passages.id,
  fileId: passages.fileId,
  ordinal: passages.ordinal,
  page: passages.page,
  kind: passages.kind,
  text: passages.text,
  bboxes: passages.bboxes,
  lineStarts: passages.lineStarts,
  tStart: passages.tStart,
  tEnd: passages.tEnd,
  speaker: passages.speaker,
}

/** A file's passages in reading order (a transcript, or the passages on one page). */
export async function listPassages(ownerId: string, fileId: string, page?: number) {
  return db
    .select(passageColumns)
    .from(passages)
    .where(
      and(
        eq(passages.ownerId, ownerId),
        eq(passages.fileId, fileId),
        page != null ? eq(passages.page, page) : undefined,
      ),
    )
    .orderBy(asc(passages.ordinal))
}

export type SourcePassage = Awaited<ReturnType<typeof listPassages>>[number]

/** One passage by its id: what a citation points at. */
export async function getPassage(ownerId: string, passageId: string) {
  const [row] = await db
    .select(passageColumns)
    .from(passages)
    .where(and(eq(passages.ownerId, ownerId), eq(passages.id, passageId)))
  if (!row) throw new LibraryError("That passage isn't in your library", 404)
  return row
}

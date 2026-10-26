import "server-only"
import { createHmac, randomBytes } from "node:crypto"
import { bylineOf } from "@konkyo/agents"
import { type FileMeta, PUBLIC, SPACES } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { env } from "@konkyo/env/server"
import { colorFor } from "@konkyo/ui/lib/space"
import { and, count, eq, gte, inArray, isNull, ne } from "drizzle-orm"
import { subtree } from "./folders"
import {
  fileContentKey,
  getFileDetail,
  getPassage,
  LibraryError,
  listPassages,
  ownFolder,
} from "./library"

const { folderShares, shareAnswers, folders, files, fileFolders } = schema

/** The page a share's link opens. */
export const sharePath = (slug: string) => `/s/${slug}`

// ------------------------------------------------------------------ the owner's side

/** A folder's public link, if it has one. */
export async function getShare(ownerId: string, folderId: string) {
  await ownFolder(ownerId, folderId)
  const share = await db.query.folderShares.findFirst({
    where: eq(folderShares.folderId, folderId),
  })
  return share
    ? {
        slug: share.slug,
        path: sharePath(share.slug),
        description: share.description,
        allowDownloads: share.allowDownloads,
        listed: share.listed,
      }
    : null
}

/** Publishes a folder, or updates its description and downloads; the link stays the same. */
export async function publishFolder(
  ownerId: string,
  folderId: string,
  input: { description?: string | null; allowDownloads?: boolean; listed?: boolean },
) {
  await ownFolder(ownerId, folderId)
  const description = input.description?.trim().slice(0, 500) || null
  await db
    .insert(folderShares)
    .values({
      folderId,
      ownerId,
      // 12 url-safe characters (72 bits): a link nobody can guess.
      slug: randomBytes(9).toString("base64url"),
      description,
      allowDownloads: input.allowDownloads ?? false,
      listed: input.listed ?? false,
    })
    .onConflictDoUpdate({
      target: folderShares.folderId,
      set: {
        ...(input.description !== undefined ? { description } : {}),
        ...(input.allowDownloads !== undefined ? { allowDownloads: input.allowDownloads } : {}),
        ...(input.listed !== undefined ? { listed: input.listed } : {}),
      },
    })
  return getShare(ownerId, folderId)
}

/** Unpublish: the link stops working at once. */
export async function unpublishFolder(ownerId: string, folderId: string) {
  await ownFolder(ownerId, folderId)
  await db.delete(folderShares).where(eq(folderShares.folderId, folderId))
}

// ------------------------------------------------------------------ the visitor's side

/**
 * A share by its link: the folder, and the sources a visitor may see (ready files in it and in
 * the folders inside it). Notes stay private: they're the owner's own writing, not sources.
 */
async function resolve(slug: string) {
  const share = await db.query.folderShares.findFirst({ where: eq(folderShares.slug, slug) })
  const folder = share
    ? await db.query.folders.findFirst({
        where: and(eq(folders.id, share.folderId), isNull(folders.deletedAt)),
      })
    : undefined
  if (!share || !folder) throw new LibraryError("This link isn't shared any more", 404)
  const folderIds = await subtree(share.ownerId, folder.id)
  const rows = await db
    .selectDistinct({
      id: files.id,
      title: files.title,
      kind: files.kind,
      pageCount: files.pageCount,
      durationSeconds: files.durationSeconds,
      meta: files.meta,
      thumbKey: files.thumbKey,
      createdAt: files.createdAt,
    })
    .from(files)
    .innerJoin(fileFolders, eq(fileFolders.fileId, files.id))
    .where(
      and(
        inArray(fileFolders.folderId, folderIds),
        eq(files.ownerId, share.ownerId),
        eq(files.status, "ready"),
        ne(files.kind, "note"),
        isNull(files.deletedAt),
      ),
    )
  return { share, folder, files: rows }
}

/** What a public folder's page shows. */
export async function openShare(slug: string) {
  const { share, folder, files: rows } = await resolve(slug)
  const color = folder.color ?? colorFor(folder.id)
  return {
    name: folder.name,
    description: share.description,
    allowDownloads: share.allowDownloads,
    files: rows
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((f) => ({
        id: f.id,
        title: f.title,
        kind: f.kind,
        pageCount: f.pageCount,
        durationSeconds: f.durationSeconds,
        byline: bylineOf(f.meta as FileMeta) ?? null,
        thumbUrl: f.thumbKey ? `/api/public/${slug}/files/${f.id}/thumb` : null,
      })),
    // resolved here, once: the page, its preview and the app all show the same colour and wall
    color,
    wall: folder.wall ?? SPACES.defaultWall[color],
    symbol: folder.symbol,
  }
}

/** A share's owner, folder and visible files, for a request about one of them. */
export async function shareScope(slug: string) {
  const { share, folder, files: rows } = await resolve(slug)
  return {
    ownerId: share.ownerId,
    folderId: folder.id,
    allowDownloads: share.allowDownloads,
    fileIds: new Set(rows.map((f) => f.id)),
  }
}

async function visibleFile(slug: string, fileId: string) {
  const scope = await shareScope(slug)
  if (!scope.fileIds.has(fileId)) throw new LibraryError("That file isn't in this folder", 404)
  return scope
}

/** A file for the public viewer: the owner's detail, with this link's content URLs. */
export async function publicFile(slug: string, fileId: string) {
  const scope = await visibleFile(slug, fileId)
  const detail = await getFileDetail(scope.ownerId, fileId)
  const content = `/api/public/${slug}/files/${fileId}/content`
  const playable = detail.kind === "audio" || detail.kind === "video"
  return {
    ...detail,
    renditionUrl: detail.renditionUrl ? content : null,
    mediaUrl: playable && detail.mediaUrl ? `${content}?as=original` : null,
    // Like the owner's library: the uploaded original, or the readable PDF of an imported link.
    downloadUrl: !scope.allowDownloads
      ? null
      : detail.downloadUrl
        ? `${content}?as=original&download=1`
        : detail.renditionUrl
          ? `${content}?download=1`
          : null,
  }
}

/** A shared file's polaroid key (page one, og:image or video thumbnail), if it has one. */
export async function publicThumbKey(slug: string, fileId: string): Promise<string | null> {
  await visibleFile(slug, fileId)
  const [file] = await db.select({ key: files.thumbKey }).from(files).where(eq(files.id, fileId))
  return file?.key ?? null
}

export async function publicPassages(slug: string, fileId: string, page?: number) {
  const scope = await visibleFile(slug, fileId)
  return listPassages(scope.ownerId, fileId, page)
}

export async function publicPassage(slug: string, passageId: string) {
  const scope = await shareScope(slug)
  const passage = await getPassage(scope.ownerId, passageId)
  if (!scope.fileIds.has(passage.fileId))
    throw new LibraryError("That passage isn't in this folder", 404)
  return passage
}

/** The storage key behind a public file's content; downloads only when the owner allows them. */
export async function publicContentKey(
  slug: string,
  fileId: string,
  as: "rendition" | "original",
  download: boolean,
) {
  const scope = await visibleFile(slug, fileId)
  if (download && !scope.allowDownloads)
    throw new LibraryError("Downloads are off for this folder", 403)
  return fileContentKey(scope.ownerId, fileId, as)
}

// ------------------------------------------------------------------ visitors' questions

/**
 * A visitor, as a keyed hash of their address: enough to count their questions, and not
 * reversible to the address (the key is the auth secret, which never leaves the server).
 */
export function visitorOf(request: Request) {
  const address =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  return createHmac("sha256", env.BETTER_AUTH_SECRET).update(address).digest("base64url")
}

/** Whether a visitor may ask now; the reason in plain words when not. */
export async function visitorLimit(folderId: string, visitor: string) {
  const since = (ms: number) => new Date(Date.now() - ms)
  const countWhere = (where: ReturnType<typeof and>) =>
    db
      .select({ n: count() })
      .from(shareAnswers)
      .where(where)
      .then((r) => r[0]?.n ?? 0)
  const [recent, today, folderToday] = await Promise.all([
    countWhere(
      and(eq(shareAnswers.visitor, visitor), gte(shareAnswers.createdAt, since(10 * 60_000))),
    ),
    countWhere(
      and(eq(shareAnswers.visitor, visitor), gte(shareAnswers.createdAt, since(86_400_000))),
    ),
    countWhere(
      and(eq(shareAnswers.folderId, folderId), gte(shareAnswers.createdAt, since(86_400_000))),
    ),
  ])
  if (folderToday >= PUBLIC.answersPerDayPerFolder)
    return "This folder has answered a lot of questions today. Try again tomorrow."
  if (today >= PUBLIC.answersPerDayPerVisitor)
    return "You've asked a lot here today. Sign up to keep going with your own library."
  if (recent >= PUBLIC.answersPerTenMinutesPerVisitor)
    return "That's a lot of questions in a few minutes. Try again shortly."
  return null
}

/** Counts a visitor's answer against the caps; returns its row, for the quote count at the end. */
export async function recordVisitorAnswer(folderId: string, visitor: string) {
  const [row] = await db
    .insert(shareAnswers)
    .values({ folderId, visitor })
    .returning({ id: shareAnswers.id })
  return row?.id
}

export async function recordAnswerQuotes(answerId: string, quotes: number) {
  await db.update(shareAnswers).set({ quotes }).where(eq(shareAnswers.id, answerId))
}

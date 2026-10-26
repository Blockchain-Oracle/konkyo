import { CONNECTORS, type FileKind, INGEST, kindForName, STORAGE } from "@konkyo/config"
import {
  ConnectorError,
  driveChangedSince,
  driveDownload,
  gmailAttachment,
  gmailMessage,
  gmailSearch,
  notionPage,
  notionVersions,
  type RemoteFile,
} from "@konkyo/connectors"
import { db, schema } from "@konkyo/db"
import { documentHtml } from "@konkyo/ingest"
import { enqueue } from "@konkyo/jobs"
import { notify } from "@konkyo/notify"
import { deleteObject, objectKey, putBytes } from "@konkyo/storage"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { ProblemError } from "./problem"

const { connections, files, fileFolders } = schema
type FileRow = typeof files.$inferSelect
type Connection = typeof connections.$inferSelect

const NAMES = { gmail: "Gmail", googledrive: "Google Drive", notion: "Notion" } as const

const safeName = (name: string) => name.replace(/[^\w.\- ]+/g, "_").slice(-120) || "file"
const escapeHtml = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")

/** An email's text as paragraphs (a blank line between them, line breaks kept), not a code block. */
const paragraphs = (text: string) =>
  text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replaceAll("\n", "<br>")}</p>`)
    .join("")

/** Bytes behind a Composio file link (temporary S3 URLs), within the upload size limit. */
async function download(remote: RemoteFile) {
  const res = await fetch(remote.url, { signal: AbortSignal.timeout(INGEST.fetchTimeoutMs * 4) })
  if (!res.ok) throw new ProblemError("unreachable", `Couldn't download ${remote.name}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.length > STORAGE.maxUploadBytes)
    throw new ProblemError("unsupported", `${remote.name} is larger than Konkyo takes`)
  return bytes
}

/** The connection ran out: it says so, once, in the Inbox, and each file says how to fix it. */
async function expire(connection: Connection) {
  if (connection.status === "expired") return
  await db.update(connections).set({ status: "expired" }).where(eq(connections.id, connection.id))
  await notify(connection.ownerId, {
    kind: "system",
    title: `Reconnect ${NAMES[connection.toolkit]}`,
    body: `Konkyo's access to ${connection.label ?? NAMES[connection.toolkit]} ran out, so it can't keep what you imported up to date.`,
    href: "/settings#connectors",
  })
}

async function store(
  file: FileRow,
  name: string,
  bytes: Uint8Array,
  mime: string,
  kind: FileKind,
  title?: string,
) {
  const key = objectKey("originals", file.ownerId, file.id, safeName(name))
  await putBytes(key, bytes, mime)
  const [row] = await db
    .update(files)
    .set({ originalKey: key, mime, kind, sizeBytes: bytes.length, ...(title ? { title } : {}) })
    .where(eq(files.id, file.id))
    .returning()
  return row as FileRow
}

/** An email's attachments come in as files of their own, beside it (each read like an upload). */
async function importAttachments(
  file: FileRow,
  connection: Connection,
  messageId: string,
  attachments: Awaited<ReturnType<typeof gmailMessage>>["attachments"],
) {
  const readable = attachments.filter((a) => kindForName(a.name))
  if (!readable.length) return
  const ids = readable.map((a) => `${messageId}/${a.id}`)
  const existing = await db
    .select({ externalId: files.externalId })
    .from(files)
    .where(
      and(
        eq(files.connectionId, connection.id),
        inArray(files.externalId, ids),
        isNull(files.deletedAt),
      ),
    )
  const have = new Set(existing.map((e) => e.externalId))
  const folders = await db
    .select({ folderId: fileFolders.folderId })
    .from(fileFolders)
    .where(eq(fileFolders.fileId, file.id))
  for (const a of readable) {
    const externalId = `${messageId}/${a.id}`
    if (have.has(externalId)) continue
    const [row] = await db
      .insert(files)
      .values({
        ownerId: file.ownerId,
        title: a.name,
        kind: kindForName(a.name) as FileKind,
        status: "queued",
        stage: "Waiting to be read",
        connectionId: connection.id,
        externalId,
        externalVersion: file.externalVersion,
      })
      .returning({ id: files.id })
    if (!row) continue
    for (const f of folders)
      await db
        .insert(fileFolders)
        .values({ fileId: row.id, folderId: f.folderId })
        .onConflictDoNothing()
    await enqueue("ingest", { fileId: row.id }, row.id)
  }
}

/**
 * Brings a connected item's content into Konkyo's storage, the first time and after it
 * changed at the source: an email becomes a page with its headers, a Drive file its own bytes
 * (Google's formats exported), a Notion page its Markdown. Then it's read like any upload.
 */
export async function materialize(file: FileRow): Promise<FileRow> {
  const connection = file.connectionId
    ? await db.query.connections.findFirst({ where: eq(connections.id, file.connectionId) })
    : undefined
  if (!connection || !file.externalId)
    throw new ProblemError(
      "unreachable",
      "Its connection was removed. Connect it again to read this file.",
    )
  if (connection.status === "expired")
    throw new ProblemError(
      "unreachable",
      `Reconnect ${NAMES[connection.toolkit]} in Settings to read this.`,
    )
  const { ownerId, accountId } = connection
  try {
    if (connection.toolkit === "gmail") {
      const [messageId, attachmentId] = file.externalId.split("/") as [string, string?]
      const message = await gmailMessage(ownerId, accountId, messageId)
      if (attachmentId) {
        const attachment = message.attachments.find((a) => a.id === attachmentId)
        if (!attachment) throw new ProblemError("unreachable", "This attachment is gone from Gmail")
        const remote = await gmailAttachment(ownerId, accountId, messageId, attachment)
        const kind = kindForName(remote.name)
        if (!kind) throw new ProblemError("unsupported", `${remote.name} can't be read yet`)
        return store(file, remote.name, await download(remote), remote.mimeType, kind)
      }
      const when = message.date ? new Date(message.date).toUTCString() : ""
      const head = [`From ${message.from}`, message.to ? `To ${message.to}` : "", when]
        .filter(Boolean)
        .map(escapeHtml)
        .join(" · ")
      const html = documentHtml(
        message.subject,
        `<h1>${escapeHtml(message.subject)}</h1><p class="source">${head}</p>${paragraphs(message.text)}`,
      )
      const row = await store(
        file,
        `${messageId}.html`,
        new TextEncoder().encode(html),
        "text/html",
        "email",
        message.subject,
      )
      await importAttachments(file, connection, messageId, message.attachments)
      return row
    }
    if (connection.toolkit === "googledrive") {
      const remote = await driveDownload(ownerId, accountId, file.externalId, file.mime ?? "")
      const kind = kindForName(remote.name)
      if (!kind) throw new ProblemError("unsupported", `${remote.name} can't be read yet`)
      return store(file, remote.name, await download(remote), remote.mimeType, kind)
    }
    const page = await notionPage(ownerId, accountId, file.externalId)
    if (!page.markdown.trim()) throw new ProblemError("no_text", "This Notion page is empty")
    return store(
      file,
      `${file.externalId}.md`,
      new TextEncoder().encode(`# ${file.title}\n\n${page.markdown}`),
      "text/markdown",
      "markdown",
    )
  } catch (error) {
    if (error instanceof ConnectorError && error.expired) {
      await expire(connection)
      throw new ProblemError(
        "unreachable",
        `Reconnect ${NAMES[connection.toolkit]} in Settings to read this.`,
      )
    }
    if (error instanceof ConnectorError) throw new ProblemError("unreachable", error.message)
    throw error
  }
}

/** Re-read an imported item: its stored copy goes, and the next read fetches it fresh. */
async function refresh(file: { id: string; originalKey: string | null }, version: string | null) {
  if (file.originalKey) await deleteObject(file.originalKey).catch(() => undefined)
  await db
    .update(files)
    .set({
      originalKey: null,
      externalVersion: version,
      status: "queued",
      stage: "Updated at the source",
    })
    .where(eq(files.id, file.id))
  await enqueue("ingest", { fileId: file.id }, `${file.id}:${version ?? Date.now()}`)
}

/**
 * Resync, every 15 minutes: Drive files and Notion pages that changed at the source
 * are read again; a Gmail connection with a watch search brings in its new matches. An account
 * whose access ran out is marked, once, with a Reconnect notice.
 */
export async function syncConnections() {
  const active = await db.query.connections.findMany({ where: eq(connections.status, "active") })
  let refreshed = 0
  let imported = 0
  for (const connection of active) {
    const since = connection.syncedAt ?? connection.createdAt
    const started = new Date()
    try {
      const mine = await db
        .select({
          id: files.id,
          externalId: files.externalId,
          externalVersion: files.externalVersion,
          originalKey: files.originalKey,
        })
        .from(files)
        .where(and(eq(files.connectionId, connection.id), isNull(files.deletedAt)))
      const byId = new Map(mine.map((f) => [f.externalId, f]))
      if (connection.toolkit === "googledrive") {
        const changed = await driveChangedSince(
          connection.ownerId,
          connection.accountId,
          since.toISOString(),
        )
        for (const c of changed) {
          const file = byId.get(c.id)
          if (file && c.version && c.version !== file.externalVersion) {
            await refresh(file, c.version)
            refreshed++
          }
        }
      } else if (connection.toolkit === "notion") {
        const versions = await notionVersions(connection.ownerId, connection.accountId)
        for (const [id, version] of versions) {
          const file = byId.get(id)
          if (file && version && version !== file.externalVersion) {
            await refresh(file, version)
            refreshed++
          }
        }
      } else if (connection.watchQuery) {
        // Gmail's after: takes seconds since the epoch.
        const after = Math.floor(since.getTime() / 1000)
        const { items } = await gmailSearch(
          connection.ownerId,
          connection.accountId,
          `${connection.watchQuery} after:${after}`,
        )
        for (const item of items) {
          if (byId.has(item.id)) continue
          const [row] = await db
            .insert(files)
            .values({
              ownerId: connection.ownerId,
              title: item.title,
              kind: "email",
              status: "queued",
              stage: "Waiting to be read",
              connectionId: connection.id,
              externalId: item.id,
              externalVersion: item.version,
            })
            .returning({ id: files.id })
          if (!row) continue
          if (connection.folderId)
            await db
              .insert(fileFolders)
              .values({ fileId: row.id, folderId: connection.folderId })
              .onConflictDoNothing()
          await enqueue("ingest", { fileId: row.id }, row.id)
          imported++
        }
      }
      await db
        .update(connections)
        .set({ syncedAt: started })
        .where(eq(connections.id, connection.id))
    } catch (error) {
      if (error instanceof ConnectorError && error.expired) await expire(connection)
      else console.warn(`[connectors] ${connection.id} sync: ${(error as Error).message}`)
    }
  }
  return { connections: active.length, refreshed, imported, every: CONNECTORS.syncEveryMinutes }
}

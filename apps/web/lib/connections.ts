import "server-only"
import { type FileKind, kindForName } from "@konkyo/config"
import {
  accountStatus,
  ConnectorError,
  driveSearch,
  gmailProfile,
  gmailSearch,
  notionSearch,
  type RemoteItem,
  removeAccount,
  startConnection,
  type Toolkit,
  WORKSPACE_EXPORTS,
} from "@konkyo/connectors"
import { db, schema } from "@konkyo/db"
import { env } from "@konkyo/env/server"
import { enqueue } from "@konkyo/jobs"
import { and, count, eq, inArray, isNull } from "drizzle-orm"
import { LibraryError, ownFolder } from "./library"
import { trashFiles } from "./trash"
import { allowanceLeft } from "./usage"

const { connections, files, fileFolders } = schema

const NAMES: Record<Toolkit, string> = {
  gmail: "Gmail",
  googledrive: "Google Drive",
  notion: "Notion",
}

/** A connector's failure in plain words; an expired account is marked so Settings says Reconnect. */
async function plainly<T>(connectionId: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof ConnectorError) {
      if (error.expired)
        await db
          .update(connections)
          .set({ status: "expired" })
          .where(eq(connections.id, connectionId))
      throw new LibraryError(
        error.expired ? "Access ran out. Reconnect it in Settings." : error.message,
        error.expired ? 409 : 502,
      )
    }
    throw error
  }
}

async function ownConnection(ownerId: string, id: string) {
  const row = await db.query.connections.findFirst({
    where: and(eq(connections.id, id), eq(connections.ownerId, ownerId)),
  })
  if (!row) throw new LibraryError("No such connection", 404)
  return row
}

/**
 * Every connector with where it stands for this person (Settings → Connectors, F42). One still
 * waiting for its sign-in is asked about first, so coming back from Google shows it connected.
 */
export async function listConnections(ownerId: string) {
  const waiting = await db
    .select({ id: connections.id })
    .from(connections)
    .where(and(eq(connections.ownerId, ownerId), eq(connections.status, "initiated")))
  await Promise.all(waiting.map((w) => checkConnection(ownerId, w.id).catch(() => undefined)))
  const rows = await db
    .select({
      id: connections.id,
      toolkit: connections.toolkit,
      status: connections.status,
      label: connections.label,
      watchQuery: connections.watchQuery,
      folderId: connections.folderId,
      syncedAt: connections.syncedAt,
      imported: count(files.id),
    })
    .from(connections)
    .leftJoin(files, and(eq(files.connectionId, connections.id), isNull(files.deletedAt)))
    .where(eq(connections.ownerId, ownerId))
    .groupBy(connections.id)
  return rows
}

export type ConnectionRow = Awaited<ReturnType<typeof listConnections>>[number]

/**
 * Connect (or reconnect) a toolkit: a fresh hosted sign-in link (they last 10 minutes), and the
 * connection it will fill. Settings opens the link and watches the connection turn active.
 */
export async function connect(ownerId: string, toolkit: Toolkit) {
  if (!env.COMPOSIO_API_KEY) throw new LibraryError("Connectors aren't set up on this server", 503)
  const existing = await db.query.connections.findFirst({
    where: and(eq(connections.ownerId, ownerId), eq(connections.toolkit, toolkit)),
  })
  // No #fragment: the hosted page appends its own query to this address.
  const callback = `${env.BETTER_AUTH_URL}/settings?connected=${toolkit}`
  const { accountId, redirectUrl } = await startConnection(ownerId, toolkit, callback).catch(
    (error: Error) => {
      throw new LibraryError(`${NAMES[toolkit]} couldn't start: ${error.message}`, 502)
    },
  )
  if (existing) {
    // Reconnecting: the old account goes, the imports stay linked to this connection.
    if (existing.accountId !== accountId) void removeAccount(existing.accountId)
    await db
      .update(connections)
      .set({ accountId, status: "initiated" })
      .where(eq(connections.id, existing.id))
    return { id: existing.id, redirectUrl }
  }
  const [row] = await db
    .insert(connections)
    .values({ ownerId, toolkit, accountId })
    .returning({ id: connections.id })
  if (!row) throw new LibraryError("Couldn't start the connection", 500)
  return { id: row.id, redirectUrl }
}

/** Asks Composio where a connection stands, and remembers it (Settings polls this after Connect). */
export async function checkConnection(ownerId: string, id: string) {
  const row = await ownConnection(ownerId, id)
  const status = await accountStatus(row.accountId).catch(() => "failed" as const)
  const next = status === "active" ? "active" : status === "initiated" ? "initiated" : "expired"
  let label = row.label
  if (next === "active" && !label && row.toolkit === "gmail")
    label = await gmailProfile(ownerId, row.accountId).catch(() => null)
  if (next !== row.status || label !== row.label)
    await db.update(connections).set({ status: next, label }).where(eq(connections.id, id))
  return { status: next, label }
}

/**
 * Disconnect (F35): access is revoked at Composio, and what came from it is kept or moved to
 * Trash, as the person chose.
 */
export async function disconnect(ownerId: string, id: string, keepFiles: boolean) {
  const row = await ownConnection(ownerId, id)
  await removeAccount(row.accountId)
  if (!keepFiles) {
    const imported = await db
      .select({ id: files.id })
      .from(files)
      .where(and(eq(files.connectionId, id), isNull(files.deletedAt)))
    if (imported.length)
      await trashFiles(
        ownerId,
        imported.map((f) => f.id),
      )
  }
  // Kept files stay in the library as ordinary files (their link to the connection is cleared).
  await db.delete(connections).where(eq(connections.id, id))
}

/** A Gmail search whose new matches come in by themselves, into a folder (or stop watching). */
export async function setWatch(
  ownerId: string,
  id: string,
  input: { watchQuery: string | null; folderId?: string | null },
) {
  const row = await ownConnection(ownerId, id)
  if (row.toolkit !== "gmail") throw new LibraryError("Only Gmail watches a search", 400)
  if (input.folderId) await ownFolder(ownerId, input.folderId)
  await db
    .update(connections)
    .set({
      watchQuery: input.watchQuery?.trim() || null,
      ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
      // New matches count from now, not from the account's whole history.
      syncedAt: new Date(),
    })
    .where(eq(connections.id, id))
}

/** One page of a connected account's items for the import picker, with what's already here. */
export async function browse(ownerId: string, id: string, query: string, page?: string) {
  const row = await ownConnection(ownerId, id)
  if (row.status !== "active") throw new LibraryError("Connect it first", 409)
  const result = await plainly(id, () =>
    row.toolkit === "gmail"
      ? gmailSearch(ownerId, row.accountId, query, page)
      : row.toolkit === "googledrive"
        ? driveSearch(ownerId, row.accountId, query, page)
        : notionSearch(ownerId, row.accountId, query, page),
  )
  const ids = result.items.map((i) => i.id)
  const have = ids.length
    ? await db
        .select({ externalId: files.externalId })
        .from(files)
        .where(
          and(eq(files.connectionId, id), inArray(files.externalId, ids), isNull(files.deletedAt)),
        )
    : []
  const imported = new Set(have.map((h) => h.externalId))
  return {
    items: result.items.map((i) => ({ ...i, imported: imported.has(i.id) })),
    next: result.next,
  }
}

/** What an item will be in the library, known before it's fetched (refined when it's read). */
function kindFor(toolkit: Toolkit, item: Pick<RemoteItem, "title" | "mimeType">): FileKind | null {
  if (toolkit === "gmail") return "email"
  if (toolkit === "notion") return "markdown"
  const exported = item.mimeType ? WORKSPACE_EXPORTS[item.mimeType] : undefined
  return kindForName(exported ? `${item.title}${exported.ext}` : item.title) ?? null
}

/**
 * Import picked items (F35): each becomes a file that the worker fetches and reads like an upload;
 * one already imported isn't added twice. Unreadable kinds are skipped and counted.
 */
export async function importItems(
  ownerId: string,
  id: string,
  input: {
    items: Pick<RemoteItem, "id" | "title" | "version" | "mimeType">[]
    folderId?: string
  },
) {
  const row = await ownConnection(ownerId, id)
  const limited = await allowanceLeft(ownerId, "files", input.items.length)
  if (limited) throw new LibraryError(limited, 429)
  if (input.folderId) await ownFolder(ownerId, input.folderId)
  const ids = input.items.map((i) => i.id)
  const have = ids.length
    ? await db
        .select({ externalId: files.externalId })
        .from(files)
        .where(
          and(eq(files.connectionId, id), inArray(files.externalId, ids), isNull(files.deletedAt)),
        )
    : []
  const already = new Set(have.map((h) => h.externalId))
  let added = 0
  let skipped = 0
  for (const item of input.items) {
    if (already.has(item.id)) continue
    const kind = kindFor(row.toolkit, item)
    if (!kind) {
      skipped++
      continue
    }
    const [file] = await db
      .insert(files)
      .values({
        ownerId,
        title: item.title,
        kind,
        mime: item.mimeType ?? null,
        status: "queued",
        stage: "Waiting to be read",
        connectionId: id,
        externalId: item.id,
        externalVersion: item.version,
      })
      .returning({ id: files.id })
    if (!file) continue
    if (input.folderId)
      await db
        .insert(fileFolders)
        .values({ fileId: file.id, folderId: input.folderId })
        .onConflictDoNothing()
    await enqueue("ingest", { fileId: file.id }, file.id)
    added++
  }
  return { added, skipped, already: already.size }
}

import { Composio } from "@composio/core"
import { CONNECTORS } from "@konkyo/config"
import { env } from "@konkyo/env/server"

/**
 * Connectors through Composio: Gmail, Google Drive and Notion. Each person is a
 * Composio user (their Konkyo id); each connection is one Composio connected account. Every
 * tool call is pinned to the toolkit version measured in testing.
 */
export type Toolkit = "gmail" | "googledrive" | "notion"
export const TOOLKITS = ["gmail", "googledrive", "notion"] as const satisfies readonly Toolkit[]

export class ConnectorError extends Error {
  constructor(
    message: string,
    /** The account's access ran out or was revoked: the person has to reconnect. */
    readonly expired = false,
  ) {
    super(message)
    this.name = "ConnectorError"
  }
}

const create = (apiKey: string) =>
  // Versions are pinned on purpose, so the SDK's "upgrade available" notice is off.
  new Composio({
    apiKey,
    toolkitVersions: CONNECTORS.versions,
    disableVersionCheck: true,
  } as ConstructorParameters<typeof Composio>[0])

let client: ReturnType<typeof create> | undefined
function composio() {
  if (!env.COMPOSIO_API_KEY) throw new ConnectorError("Connectors aren't set up on this server")
  client ??= create(env.COMPOSIO_API_KEY)
  return client
}

function authConfig(toolkit: Toolkit) {
  const id = {
    gmail: env.COMPOSIO_AUTH_CONFIG_GMAIL,
    googledrive: env.COMPOSIO_AUTH_CONFIG_GOOGLEDRIVE,
    notion: env.COMPOSIO_AUTH_CONFIG_NOTION,
  }[toolkit]
  if (!id) throw new ConnectorError(`${toolkit} isn't set up on this server`)
  return id
}

// ------------------------------------------------------------------ accounts

/** A hosted sign-in link for the toolkit (valid for 10 minutes), and the account it will fill. */
export async function startConnection(userId: string, toolkit: Toolkit, callbackUrl: string) {
  const request = await composio().connectedAccounts.link(userId, authConfig(toolkit), {
    callbackUrl,
  })
  return { accountId: request.id, redirectUrl: request.redirectUrl as string }
}

export type AccountStatus = "initiated" | "active" | "expired" | "failed"

/** Where a connection stands at Composio. */
export async function accountStatus(accountId: string): Promise<AccountStatus> {
  const account = (await composio().connectedAccounts.get(accountId)) as { status?: string }
  switch (account.status) {
    case "ACTIVE":
      return "active"
    case "INITIATED":
    case "INITIALIZING":
      return "initiated"
    case "EXPIRED":
    case "INACTIVE":
      return "expired"
    default:
      return "failed"
  }
}

/** Revokes the connection at Composio (Disconnect). */
export async function removeAccount(accountId: string) {
  await composio()
    .connectedAccounts.delete(accountId)
    .catch(() => undefined)
}

const EXPIRED = /expired|revoked|invalid_grant|unauthori[sz]ed|401|reauth|not active|inactive/i

async function run<T>(
  slug: string,
  userId: string,
  accountId: string,
  args: Record<string, unknown>,
): Promise<T> {
  let result: { successful?: boolean; error?: string | null; data?: unknown }
  try {
    result = (await composio().tools.execute(slug, {
      userId,
      connectedAccountId: accountId,
      arguments: args,
    })) as typeof result
  } catch (error) {
    const message = (error as Error).message ?? String(error)
    throw new ConnectorError(message, EXPIRED.test(message))
  }
  if (!result.successful) {
    const message = result.error ?? `${slug} failed`
    throw new ConnectorError(message, EXPIRED.test(message))
  }
  return result.data as T
}

/** A file Composio hands back as a temporary link; the caller copies it into our storage. */
export type RemoteFile = { url: string; name: string; mimeType: string }

/** One row in the import picker. */
export type RemoteItem = {
  id: string
  title: string
  detail: string
  /** When it last changed, for resync (ISO). */
  version: string | null
  kind: "email" | "file" | "page"
  mimeType?: string
}

// ------------------------------------------------------------------ Gmail

type GmailMessage = {
  messageId: string
  subject?: string
  sender?: string
  to?: string
  messageTimestamp?: string
  messageText?: string
  attachmentList?: Record<string, unknown>[]
}

const who = (sender?: string) =>
  sender
    ?.replace(/<[^>]+>/, "")
    .replace(/"/g, "")
    .trim() || "Unknown"

/** Messages matching a Gmail search (its own syntax: from:, subject:, has:attachment …). */
export async function gmailSearch(
  userId: string,
  accountId: string,
  query: string,
  pageToken?: string,
) {
  const data = await run<{ messages?: GmailMessage[]; nextPageToken?: string }>(
    "GMAIL_FETCH_EMAILS",
    userId,
    accountId,
    {
      query,
      max_results: CONNECTORS.pageSize,
      include_payload: false,
      verbose: false,
      ...(pageToken ? { page_token: pageToken } : {}),
    },
  )
  const items: RemoteItem[] = (data.messages ?? []).map((m) => ({
    id: m.messageId,
    title: m.subject?.trim() || "(no subject)",
    detail: who(m.sender),
    version: m.messageTimestamp ?? null,
    kind: "email",
  }))
  // Gmail doesn't return results newest first; the picker does.
  items.sort((a, b) => (b.version ?? "").localeCompare(a.version ?? ""))
  return { items, next: data.nextPageToken ?? null }
}

/** The connected address, to show which mailbox it is. */
export async function gmailProfile(userId: string, accountId: string) {
  const data = await run<{ emailAddress?: string; response_data?: { emailAddress?: string } }>(
    "GMAIL_GET_PROFILE",
    userId,
    accountId,
    {},
  )
  return data.emailAddress ?? data.response_data?.emailAddress ?? null
}

export type Attachment = { id: string; name: string; mimeType: string }

/** One email in full: headers, its plain text and its attachments. */
export async function gmailMessage(userId: string, accountId: string, messageId: string) {
  const m = await run<GmailMessage>("GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID", userId, accountId, {
    message_id: messageId,
    format: "full",
  })
  // The attachment list is untyped in the schema, so both spellings are read.
  const attachments: Attachment[] = (m.attachmentList ?? []).flatMap((a) => {
    const id = (a.attachmentId ?? a.attachment_id ?? a.id) as string | undefined
    const name = (a.filename ?? a.fileName ?? a.name) as string | undefined
    return id && name
      ? [{ id, name, mimeType: String(a.mimeType ?? a.mime_type ?? "application/octet-stream") }]
      : []
  })
  return {
    id: m.messageId ?? messageId,
    subject: m.subject?.trim() || "(no subject)",
    from: m.sender ?? "",
    to: m.to ?? "",
    date: m.messageTimestamp ?? null,
    text: m.messageText ?? "",
    attachments,
  }
}

export async function gmailAttachment(
  userId: string,
  accountId: string,
  messageId: string,
  attachment: Attachment,
): Promise<RemoteFile> {
  const data = await run<{ file?: { s3url?: string; name?: string; mimetype?: string } }>(
    "GMAIL_GET_ATTACHMENT",
    userId,
    accountId,
    { message_id: messageId, attachment_id: attachment.id, file_name: attachment.name },
  )
  if (!data.file?.s3url) throw new ConnectorError(`Couldn't download ${attachment.name}`)
  return {
    url: data.file.s3url,
    name: data.file.name ?? attachment.name,
    mimeType: data.file.mimetype ?? attachment.mimeType,
  }
}

// ------------------------------------------------------------------ Google Drive

type DriveFile = {
  id: string
  name: string
  mimeType: string
  modifiedTime?: string
  size?: string
  owners?: { displayName?: string }[]
}

const FOLDER = "application/vnd.google-apps.folder"
/** Google's own formats, exported to something Konkyo reads (Docs/Slides keep their layout). */
export const WORKSPACE_EXPORTS: Record<string, { mime: string; ext: string }> = {
  "application/vnd.google-apps.document": {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ext: ".docx",
  },
  "application/vnd.google-apps.presentation": {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ext: ".pptx",
  },
  "application/vnd.google-apps.spreadsheet": { mime: "application/pdf", ext: ".pdf" },
}

/** Files in Drive matching some words (names and contents), folders left out. */
export async function driveSearch(
  userId: string,
  accountId: string,
  query: string,
  pageToken?: string,
) {
  const words = query.trim().replace(/'/g, "\\'")
  const q = [
    `mimeType != '${FOLDER}'`,
    "trashed = false",
    words ? `fullText contains '${words}'` : "",
  ]
    .filter(Boolean)
    .join(" and ")
  const data = await run<{ files?: DriveFile[]; nextPageToken?: string }>(
    "GOOGLEDRIVE_FIND_FILE",
    userId,
    accountId,
    {
      q,
      pageSize: CONNECTORS.pageSize,
      fields: "nextPageToken, files(id, name, mimeType, modifiedTime, size, owners(displayName))",
      ...(words ? {} : { orderBy: "modifiedTime desc" }),
      ...(pageToken ? { pageToken } : {}),
    },
  )
  const items: RemoteItem[] = (data.files ?? []).map((f) => ({
    id: f.id,
    title: f.name,
    detail: [f.owners?.[0]?.displayName, f.modifiedTime?.slice(0, 10)].filter(Boolean).join(" · "),
    version: f.modifiedTime ?? null,
    kind: "file",
    mimeType: f.mimeType,
  }))
  return { items, next: data.nextPageToken ?? null }
}

/** A Drive file's bytes (Google's own formats exported first). */
export async function driveDownload(
  userId: string,
  accountId: string,
  fileId: string,
  mimeType: string,
): Promise<RemoteFile> {
  const exported = WORKSPACE_EXPORTS[mimeType]
  const data = await run<{
    name?: string
    downloaded_file_content?: { s3url?: string; name?: string; mimetype?: string } | null
    export_size_limit_exceeded?: boolean
  }>("GOOGLEDRIVE_DOWNLOAD_FILE", userId, accountId, {
    fileId,
    ...(exported ? { mime_type: exported.mime } : {}),
  })
  if (data.export_size_limit_exceeded)
    throw new ConnectorError("Google can't export a file this big (over 10 MB)")
  const file = data.downloaded_file_content
  if (!file?.s3url) throw new ConnectorError("Couldn't download that file from Drive")
  const name = file.name ?? data.name ?? "Drive file"
  return {
    url: file.s3url,
    name: exported && !name.endsWith(exported.ext) ? `${name}${exported.ext}` : name,
    mimeType: file.mimetype ?? exported?.mime ?? mimeType,
  }
}

/** Drive files changed since a moment (resync: one call per connection, then matched by id). */
export async function driveChangedSince(userId: string, accountId: string, since: string) {
  const data = await run<{ files?: DriveFile[] }>("GOOGLEDRIVE_FIND_FILE", userId, accountId, {
    q: `modifiedTime > '${since}' and trashed = false and mimeType != '${FOLDER}'`,
    fields: "files(id, mimeType, modifiedTime)",
    orderBy: "modifiedTime desc",
    pageSize: 100,
  })
  return (data.files ?? []).map((f) => ({
    id: f.id,
    mimeType: f.mimeType,
    version: f.modifiedTime ?? null,
  }))
}

// ------------------------------------------------------------------ Notion

type NotionPage = {
  id: string
  url?: string
  last_edited_time?: string
  archived?: boolean
  in_trash?: boolean
  properties?: Record<string, { type?: string; title?: { plain_text?: string }[] }>
}

const titleOf = (page: NotionPage) =>
  Object.values(page.properties ?? {})
    .find((p) => p.type === "title")
    ?.title?.map((t) => t.plain_text ?? "")
    .join("")
    .trim() || "Untitled page"

/** Pages whose titles match, most recently edited first. */
export async function notionSearch(
  userId: string,
  accountId: string,
  query: string,
  cursor?: string,
) {
  const data = await run<{
    results?: NotionPage[]
    next_cursor?: string | null
    has_more?: boolean
  }>("NOTION_SEARCH_NOTION_PAGE", userId, accountId, {
    query,
    page_size: CONNECTORS.pageSize,
    filter_value: "page",
    filter_property: "object",
    timestamp: "last_edited_time",
    direction: "descending",
    ...(cursor ? { start_cursor: cursor } : {}),
  })
  const items: RemoteItem[] = (data.results ?? [])
    .filter((p) => !p.archived && !p.in_trash)
    .map((p) => ({
      id: p.id,
      title: titleOf(p),
      detail: p.last_edited_time ? `Edited ${p.last_edited_time.slice(0, 10)}` : "",
      version: p.last_edited_time ?? null,
      kind: "page",
    }))
  return { items, next: data.has_more ? (data.next_cursor ?? null) : null }
}

/** A Notion page as Markdown (one call), with when it was last edited. */
export async function notionPage(userId: string, accountId: string, pageId: string) {
  const data = await run<{ markdown?: string; truncated?: boolean }>(
    "NOTION_GET_PAGE_MARKDOWN",
    userId,
    accountId,
    { page_id: pageId },
  )
  return { markdown: data.markdown ?? "", truncated: Boolean(data.truncated) }
}

/** When each of these Notion pages was last edited (resync): one search, newest first. */
export async function notionVersions(userId: string, accountId: string) {
  const { items } = await notionSearch(userId, accountId, "")
  return new Map(items.map((i) => [i.id, i.version]))
}

import "server-only"
import { db, schema } from "@konkyo/db"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "./auth"
import { noteDocx } from "./export-note"
import { LibraryError } from "./library"

export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file"

/**
 * A note in Google Docs (plan F26): the same Word file as the download, uploaded to the
 * person's Drive with conversion, so Docs keeps the headings, citations and reference list.
 * The drive.file scope lets Konkyo see only the files it creates there.
 */
export async function exportToGoogleDocs(ownerId: string, noteId: string, style: string) {
  // The person's Google account (Better Auth's own row id), refreshed if its token has expired.
  const google = await db.query.account.findFirst({
    columns: { id: true },
    where: and(eq(schema.account.userId, ownerId), eq(schema.account.providerId, "google")),
  })
  if (!google) throw new LibraryError("Continue with Google first to use Google Docs.", 403)
  const token = await auth.api
    .getAccessToken({ body: { accountId: google.id, userId: ownerId }, headers: await headers() })
    .catch(() => null)
  if (!token?.accessToken || !token.scopes?.includes(DRIVE_FILE_SCOPE))
    return { needsScope: true as const }
  const { title, bytes } = await noteDocx(ownerId, noteId, style)
  const boundary = `konkyo-${crypto.randomUUID()}`
  const metadata = JSON.stringify({ name: title, mimeType: "application/vnd.google-apps.document" })
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`,
    new Uint8Array(bytes),
    `\r\n--${boundary}--`,
  ])
  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token.accessToken}`,
        "content-type": `multipart/related; boundary=${boundary}`,
      },
      body,
      signal: AbortSignal.timeout(30_000),
    },
  )
  if (res.status === 401 || res.status === 403) {
    const detail = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    const message = detail?.error?.message ?? ""
    // The Drive API switched off for the app's Google Cloud project is a setup problem, not
    // something the person can fix by granting access again.
    if (/has not been used|is disabled/i.test(message))
      throw new LibraryError("Google Drive isn't enabled for Konkyo yet. Try again later.", 503)
    return { needsScope: true as const }
  }
  if (!res.ok) throw new LibraryError("Google Docs didn't take the file. Try again.", 502)
  const file = (await res.json()) as { id: string; webViewLink?: string }
  return { url: file.webViewLink ?? `https://docs.google.com/document/d/${file.id}/edit` }
}

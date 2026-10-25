import { EMAIL, type FileKind, kindForName, STORAGE } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { fileSpaceEvents, spaceEvent } from "@konkyo/db/live"
import {
  addressOf,
  attachmentBytes,
  inboundDomain,
  type Received,
  receivedEmail,
} from "@konkyo/email"
import { documentHtml } from "@konkyo/ingest/convert"
import { enqueue } from "@konkyo/jobs"
import { notify } from "@konkyo/notify"
import { objectKey, putBytes } from "@konkyo/storage"
import { and, eq, isNull, sql } from "drizzle-orm"

const { inboundEmails, folders, files, fileFolders, spaceMembers, user } = schema

const escapeHtml = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
const safeName = (name: string) => name.replace(/[^\w.\- ]+/g, "_").slice(-120) || "file"

/** The body as plain text: the text part, or the HTML part with its tags taken out. */
function bodyText(mail: Received) {
  if (mail.text?.trim()) return mail.text
  return (mail.html ?? "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
}

/** The text without the quoted thread under it and the signature, so a reply is just the reply. */
const ownWords = (text: string) =>
  text
    .replace(/\r\n/g, "\n")
    .split(/\n(?:On .{4,200} wrote:|-{2,} ?Original Message ?-{2,}|-- \n)/)[0]
    ?.split("\n")
    .filter((line) => !line.startsWith(">"))
    .join("\n")
    .trim() ?? ""

const paragraphs = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replaceAll("\n", "<br>")}</p>`)
    .join("")

/** A body this long is worth reading as a source; a line saying "see attached" isn't. */
const WORTH_READING_WORDS = 40

/** The space a recipient address names (<token>@in.konkyo.xyz), if any. */
async function spaceFor(to: string[]) {
  const domain = inboundDomain().toLowerCase()
  for (const address of to) {
    const [local, host] = addressOf(address).split("@")
    if (!local || host !== domain) continue
    const space = await db.query.folders.findFirst({
      where: and(eq(folders.inboundToken, local), isNull(folders.deletedAt)),
    })
    // only a space's own folder has an address
    if (space && space.spaceId === space.id) return space
  }
  return null
}

/** Who sent it, if they may add to this space themselves: its owner, or a member who adds. */
async function adderFor(spaceId: string, ownerId: string, from: string) {
  const [person] = await db
    .select({ id: user.id })
    .from(user)
    .where(
      and(sql`lower(${user.email}) = ${from}`, sql`coalesce(${user.isAnonymous}, false) = false`),
    )
    .limit(1)
  if (!person) return null
  if (person.id === ownerId) return person.id
  const member = await db.query.spaceMembers.findFirst({
    where: and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, person.id)),
  })
  return member?.role === "add" ? person.id : null
}

/**
 * The email's sources, filed in the space and queued to be read: each readable attachment (up to
 * EMAIL.attachmentsPerEmail, within the upload limit) and the body when it says enough on its own.
 */
async function addSources(mail: Received, spaceId: string, ownerId: string) {
  const ids: string[] = []
  // `mail:<email>/<part>` marks each source, so a retry after a failure part-way adds the rest only
  const add = async (
    part: string,
    title: string,
    name: string,
    load: () => Promise<Uint8Array>,
    mime: string,
    kind: FileKind,
  ) => {
    const externalId = `mail:${mail.id}/${part}`
    const done = await db.query.files.findFirst({
      where: and(eq(files.ownerId, ownerId), eq(files.externalId, externalId)),
      columns: { id: true },
    })
    if (done) {
      ids.push(done.id)
      return
    }
    const bytes = await load()
    const [file] = await db
      .insert(files)
      .values({
        ownerId,
        title,
        kind,
        mime,
        status: "queued",
        stage: "Waiting to be read",
        externalId,
      })
      .returning({ id: files.id })
    if (!file) return
    const key = objectKey("originals", ownerId, file.id, safeName(name))
    await putBytes(key, bytes, mime)
    await db
      .update(files)
      .set({ originalKey: key, sizeBytes: bytes.length })
      .where(eq(files.id, file.id))
    await db
      .insert(fileFolders)
      .values({ fileId: file.id, folderId: spaceId })
      .onConflictDoNothing()
    await fileSpaceEvents(db, file.id, "source_added", ownerId)
    await enqueue("ingest", { fileId: file.id }, file.id)
    ids.push(file.id)
  }

  const readable = mail.attachments
    .filter((a) => kindForName(a.filename) && a.size <= STORAGE.maxUploadBytes)
    .slice(0, EMAIL.attachmentsPerEmail)
  for (const a of readable)
    await add(
      a.id,
      a.filename,
      a.filename,
      () => attachmentBytes(mail.id, a.id),
      a.contentType,
      kindForName(a.filename) as FileKind,
    )

  const words = ownWords(bodyText(mail))
  if (words.split(/\s+/).length >= WORTH_READING_WORDS) {
    const subject = mail.subject.trim() || "(no subject)"
    const html = documentHtml(
      subject,
      `<h1>${escapeHtml(subject)}</h1><p class="source">From ${escapeHtml(mail.from)}</p>${paragraphs(words)}`,
    )
    await add(
      "body",
      subject,
      `${mail.id}.html`,
      async () => new TextEncoder().encode(html),
      "text/html",
      "email",
    )
  }
  return ids
}

/**
 * One email sent to a space's address (plan F59). Read in full from Resend, routed by address,
 * and then: a sender who may add to the space, whose own domain vouched for the mail, has its
 * sources added at once; anyone else's waits in the owner's Inbox. `approvedBy` is the owner
 * saying yes to a held one. Every outcome is recorded; nothing is done twice.
 */
export async function handleInbound(inboundId: string, approvedBy?: string) {
  const row = await db.query.inboundEmails.findFirst({ where: eq(inboundEmails.id, inboundId) })
  if (!row) return
  if (approvedBy ? row.status !== "held" : row.status !== "received") return
  const set = (values: Partial<typeof inboundEmails.$inferInsert>) =>
    db.update(inboundEmails).set(values).where(eq(inboundEmails.id, inboundId))

  const mail = await receivedEmail(row.emailId)
  const space = row.spaceId
    ? await db.query.folders.findFirst({
        where: and(eq(folders.id, row.spaceId), isNull(folders.deletedAt)),
      })
    : await spaceFor(mail.to)
  if (!space) {
    await set({ status: "unknown", reason: "No space has that address" })
    return
  }
  const from = addressOf(mail.from)
  const adder = approvedBy ? space.ownerId : await adderFor(space.id, space.ownerId, from)

  if (!adder || (!approvedBy && !mail.authenticated)) {
    const reason = !adder
      ? "The sender isn't in this space"
      : "The sender's domain didn't confirm this email came from them"
    await set({ spaceId: space.id, status: "held", reason })
    const count = mail.attachments.filter((a) => kindForName(a.filename)).length
    await notify(space.ownerId, {
      kind: "held-mail",
      title: `Mail for ${space.name} from ${from}`,
      body: `“${mail.subject.trim() || "(no subject)"}”${count ? ` · ${count} attachment${count === 1 ? "" : "s"}` : ""}. ${reason}: add it?`,
      href: `/spaces/${space.id}`,
      tag: `held-${inboundId}`,
      data: { inboundId, spaceId: space.id },
    })
    await spaceEvent(db, {
      spaceId: space.id,
      actorId: null,
      kind: "mail_arrived",
      subjectId: inboundId,
      data: { from, held: true, count: 0 },
    })
    return
  }

  const fileIds = await addSources(mail, space.id, adder)
  await set({
    spaceId: space.id,
    status: "imported",
    fileIds,
    reason: fileIds.length ? null : "Nothing in it could be read",
    ...(approvedBy ? { decidedBy: approvedBy, decidedAt: new Date() } : {}),
  })
  await spaceEvent(db, {
    spaceId: space.id,
    actorId: adder,
    kind: "mail_arrived",
    subjectId: inboundId,
    data: { from, held: false, count: fileIds.length },
  })
}

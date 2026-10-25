import { EMAIL, type FileKind, kindForName, LIMITS, mimeForName, STORAGE } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { fileSpaceEvents, spaceEvent } from "@konkyo/db/live"
import type { InboundStatus } from "@konkyo/db/schema"
import {
  addressOf,
  attachmentBytes,
  inboundDomain,
  type Received,
  receivedEmail,
} from "@konkyo/email"
import { documentHtml } from "@konkyo/ingest/convert"
import { enqueue, QUEUES } from "@konkyo/jobs"
import { notify } from "@konkyo/notify"
import { objectKey, putBytes } from "@konkyo/storage"
import { and, eq, isNull, lt, or, sql } from "drizzle-orm"

const { inboundEmails, inboxItems, folders, files, fileFolders, spaceMembers, user } = schema

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

/** Mail still waiting or half-done after this long is picked up by the daily sweep. */
const STUCK_MS = 60 * 60_000

/** A body this long is worth reading as a source; a line saying "see attached" isn't. */
const WORTH_READING_WORDS = 40

/** The space a recipient address names (<token>@in.konkyo.xyz), if any. */
async function spaceFor(to: string[]) {
  const domain = inboundDomain().toLowerCase()
  for (const value of to) {
    const [local, host] = (addressOf(value) ?? "").split("@")
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

/** Files this person may still add today (the same daily allowance uploads and imports use). */
async function filesLeft(ownerId: string) {
  const [row] = await db.execute<{ used: number; guest: boolean }>(sql`
    select
      (select count(*) from files where owner_id = ${ownerId} and kind <> 'note'
        and created_at > now() - interval '24 hours')::int as used,
      coalesce((select is_anonymous from "user" where id = ${ownerId}), false) as guest`)
  const limit = row?.guest ? LIMITS.guestFilesPerDay : LIMITS.filesPerDay
  return Math.max(0, limit - (row?.used ?? 0))
}

/**
 * The email's sources, filed in the space and queued to be read: each readable attachment (up to
 * EMAIL.attachmentsPerEmail, within the upload size limit and the day's file allowance) and the
 * body when it says enough on its own. Each source carries `mail:<email>/<part>`: a retry finishes
 * the ones a failure left half-made and adds only what's missing.
 */
async function addSources(mail: Received, spaceId: string, ownerId: string) {
  const ids: string[] = []
  let left = await filesLeft(ownerId)
  const add = async (
    part: string,
    title: string,
    name: string,
    load: () => Promise<Uint8Array>,
    kind: FileKind,
  ) => {
    const externalId = `mail:${mail.id}/${part}`
    // the type comes from the name, never from the sender (an HTML ".pdf" stays a PDF)
    const mime = kind === "email" ? "text/html; charset=utf-8" : mimeForName(name)
    let file = await db.query.files.findFirst({
      where: and(eq(files.ownerId, ownerId), eq(files.externalId, externalId)),
      columns: { id: true, originalKey: true },
    })
    if (!file) {
      if (left <= 0) return
      left--
      const [made] = await db
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
        .returning({ id: files.id, originalKey: files.originalKey })
      file = made
    }
    if (!file) return
    // The stored key is written last: until it's there, a retry redoes every step (filing
    // ignores a duplicate, and reading again replaces the same passages).
    if (!file.originalKey) {
      const bytes = await load()
      const key = objectKey("originals", ownerId, file.id, safeName(name))
      await putBytes(key, bytes, mime)
      await db
        .insert(fileFolders)
        .values({ fileId: file.id, folderId: spaceId })
        .onConflictDoNothing()
      await db.update(files).set({ sizeBytes: bytes.length }).where(eq(files.id, file.id))
      await fileSpaceEvents(db, file.id, "source_added", ownerId)
      await db.update(files).set({ originalKey: key }).where(eq(files.id, file.id))
      await enqueue("ingest", { fileId: file.id }, file.id)
    }
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
      "email",
    )
  }
  return { ids, capped: left <= 0 }
}

/**
 * Takes the email for this job, atomically: from "received" (a new delivery) or "approved" (the
 * owner's yes), or back from "importing" when it's this same job's retry. Another job (a second
 * delivery, a double click) gets nothing and stops.
 */
async function claim(inboundId: string, from: InboundStatus, jobId: string) {
  const [row] = await db
    .update(inboundEmails)
    .set({ status: "importing", claimedBy: jobId })
    .where(
      and(
        eq(inboundEmails.id, inboundId),
        or(
          eq(inboundEmails.status, from),
          and(eq(inboundEmails.status, "importing"), eq(inboundEmails.claimedBy, jobId)),
        ),
      ),
    )
    .returning()
  return row ?? null
}

/** Held-mail cards this space's owner got in the last day (past the cap they come without a push). */
async function heldNoticesToday(spaceId: string) {
  const [row] = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from inbox_items
    where kind = 'held-mail' and data->>'spaceId' = ${spaceId}
      and created_at > now() - interval '24 hours'`)
  return row?.n ?? 0
}

/**
 * One email sent to a space's address (plan F59). Claimed by this job, read in full from Resend,
 * routed by address, and then: a sender who may add to the space, whose own domain vouched for
 * the mail, has its sources added at once; anyone else's waits in the owner's Inbox. `approvedBy`
 * is the owner saying yes to a held one.
 */
export async function handleInbound(inboundId: string, jobId: string, approvedBy?: string) {
  const row = await claim(inboundId, approvedBy ? "approved" : "received", jobId)
  if (!row) return
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
  const adder = approvedBy
    ? space.ownerId
    : from
      ? await adderFor(space.id, space.ownerId, from)
      : null

  if (!adder || (!approvedBy && !mail.authenticated)) {
    const reason = !from
      ? "The sender's address couldn't be read"
      : !adder
        ? "The sender isn't in this space"
        : "The sender's domain didn't confirm this email came from them"
    // Every held email gets its Inbox card (the only way to say yes); past the day's notices it
    // arrives quietly, without a push. The card comes first: if it can't be made, the retry
    // tries again, where a row already marked held would stop it.
    const quiet = (await heldNoticesToday(space.id)) >= EMAIL.heldNoticesPerDay
    const count = mail.attachments.filter((a) => kindForName(a.filename)).length
    await notify(space.ownerId, {
      push: !quiet,
      kind: "held-mail",
      title: `Mail for ${space.name} from ${from ?? "an unreadable address"}`,
      body: `“${mail.subject.trim().slice(0, 140) || "(no subject)"}”${count ? ` · ${count} attachment${count === 1 ? "" : "s"}` : ""}. ${reason}: add it?`,
      href: `/spaces/${space.id}`,
      tag: `held-${inboundId}`,
      data: { inboundId, spaceId: space.id },
    })
    await set({ spaceId: space.id, status: "held", reason })
    await spaceEvent(db, {
      spaceId: space.id,
      actorId: null,
      kind: "mail_arrived",
      subjectId: inboundId,
      data: { held: true, count: 0 },
    })
    return
  }

  const { ids, capped } = await addSources(mail, space.id, adder)
  await set({
    spaceId: space.id,
    status: "imported",
    fileIds: ids,
    reason: capped
      ? "The day's file allowance ran out: some of it wasn't added"
      : ids.length
        ? null
        : "Nothing in it could be read",
  })
  await spaceEvent(db, {
    spaceId: space.id,
    actorId: adder,
    kind: "mail_arrived",
    subjectId: inboundId,
    data: { held: false, count: ids.length },
  })
}

/**
 * A job that threw: counted, and past the queue's retries the email is marked failed and the
 * space's owner told, so nothing sits half-done without anyone knowing. Returns whether the queue
 * should try again.
 */
export async function inboundFailed(inboundId: string, error: Error, final = false) {
  const [row] = await db
    .update(inboundEmails)
    .set({ attempts: sql`${inboundEmails.attempts} + 1` })
    .where(eq(inboundEmails.id, inboundId))
    .returning()
  if (!row || (!final && row.attempts <= QUEUES.inbound.options.retryLimit)) return true
  await db
    .update(inboundEmails)
    .set({ status: "failed", reason: error.message.slice(0, 300) })
    .where(eq(inboundEmails.id, inboundId))
  const space = row.spaceId
    ? await db.query.folders.findFirst({ where: eq(folders.id, row.spaceId) })
    : null
  if (space)
    await notify(space.ownerId, {
      kind: "system",
      title: `Mail for ${space.name} couldn't be added`,
      body: `From ${row.from}: “${row.subject || "(no subject)"}”. Ask them to send it again.`,
      href: `/spaces/${space.id}`,
    })
  return false
}

/**
 * The daily sweep: mail Resend stopped re-delivering before a job took it is queued again; mail a
 * job died on without failing (a timeout) is marked failed and its owner told; held mail nobody
 * said yes to in EMAIL.heldDays goes, with its Inbox card.
 */
export async function expireHeldMail() {
  const waiting = await db
    .select({ id: inboundEmails.id })
    .from(inboundEmails)
    .where(
      and(
        eq(inboundEmails.status, "received"),
        lt(inboundEmails.receivedAt, new Date(Date.now() - STUCK_MS)),
      ),
    )
  for (const w of waiting) await enqueue("inbound", { inboundId: w.id })
  const stuck = await db
    .select({ id: inboundEmails.id })
    .from(inboundEmails)
    .where(
      and(
        or(eq(inboundEmails.status, "importing"), eq(inboundEmails.status, "approved")),
        lt(inboundEmails.receivedAt, new Date(Date.now() - STUCK_MS)),
      ),
    )
  for (const s of stuck) await inboundFailed(s.id, new Error("It stopped part-way"), true)

  const gone = await db
    .update(inboundEmails)
    .set({ status: "discarded", reason: `Nobody said yes in ${EMAIL.heldDays} days` })
    .where(
      and(
        eq(inboundEmails.status, "held"),
        lt(inboundEmails.receivedAt, new Date(Date.now() - EMAIL.heldDays * 86_400_000)),
      ),
    )
    .returning({ id: inboundEmails.id })
  for (const g of gone)
    await db
      .update(inboxItems)
      .set({ dismissedAt: new Date() })
      .where(and(eq(inboxItems.kind, "held-mail"), sql`${inboxItems.data}->>'inboundId' = ${g.id}`))
  return gone.length
}

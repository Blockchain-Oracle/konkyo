import "server-only"
import { createHash, randomInt } from "node:crypto"
import { APP, EMAIL } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { EmailError, emailReady, inboundDomain, sendEmail } from "@konkyo/email"
import { inviteEmail } from "@konkyo/email/templates"
import { env } from "@konkyo/env/server"
import { enqueue } from "@konkyo/jobs"
import { and, count, eq, isNull, sql } from "drizzle-orm"
import { LibraryError } from "./library"
import { inviteFor, roleIn } from "./members"

const { folders, inboundEmails, inboxItems, fileFolders, files, spaceMembers, user } = schema

/*
 * Email and spaces (plan F59): each space has an address (<token>@in.konkyo.xyz) that its owner
 * and the people who add to it can mail papers to, and anyone who can invite can invite by email.
 * The worker reads what arrives (apps/worker/src/inbound.ts); this side gives out addresses,
 * hears the owner's yes or no on held mail, and sends invites.
 */

/** Inbound needs the webhook's secret too: without it, no address is handed out. */
export const inboundReady = () => emailReady() && Boolean(env.RESEND_WEBHOOK_SECRET)

const newAddressToken = () =>
  Array.from(
    { length: EMAIL.inboundTokenLength },
    () => EMAIL.inboundAlphabet[randomInt(EMAIL.inboundAlphabet.length)],
  ).join("")

const addressFor = (token: string) => `${token}@${inboundDomain()}`

/**
 * The space's email address: made the first time its owner (or someone who adds) looks. Readers
 * don't get it: their mail would only wait for the owner. Null when this server has no inbound.
 */
export async function spaceAddress(userId: string, spaceId: string) {
  const role = await roleIn(userId, spaceId)
  if (role === "read") throw new LibraryError("Only people who add to this space can mail it", 403)
  if (!inboundReady()) return null
  const space = await db.query.folders.findFirst({
    where: eq(folders.id, spaceId),
    columns: { inboundToken: true },
  })
  if (space?.inboundToken) return addressFor(space.inboundToken)
  // set once, if nobody else set it at the same moment
  for (let tries = 0; tries < 3; tries++) {
    const token = newAddressToken()
    const [set] = await db
      .update(folders)
      .set({ inboundToken: token })
      .where(and(eq(folders.id, spaceId), isNull(folders.inboundToken)))
      .returning({ token: folders.inboundToken })
      .catch(() => [] as { token: string | null }[]) // a token another space already has
    if (set?.token) return addressFor(set.token)
    const again = await db.query.folders.findFirst({
      where: eq(folders.id, spaceId),
      columns: { inboundToken: true },
    })
    if (again?.inboundToken) return addressFor(again.inboundToken)
  }
  throw new LibraryError("Couldn't make an address just now. Try again.", 500)
}

/** A new address for the space (the old one stops at once). Owner only. */
export async function newSpaceAddress(userId: string, spaceId: string) {
  if ((await roleIn(userId, spaceId)) !== "owner")
    throw new LibraryError("Only the space's owner can do that", 403)
  if (!inboundReady()) throw new LibraryError("Email isn't set up on this server", 503)
  for (let tries = 0; tries < 3; tries++) {
    const token = newAddressToken()
    const ok = await db
      .update(folders)
      .set({ inboundToken: token })
      .where(eq(folders.id, spaceId))
      .then(() => true)
      .catch(() => false)
    if (ok) return addressFor(token)
  }
  throw new LibraryError("Couldn't make an address just now. Try again.", 500)
}

/**
 * The owner's word on mail that was held (a sender not in the space, or not vouched for by
 * their domain): yes queues it to be added as the owner's; no keeps nothing. Either way the
 * Inbox card goes.
 */
export async function decideHeld(userId: string, inboundId: string, add: boolean) {
  const row = await db.query.inboundEmails.findFirst({ where: eq(inboundEmails.id, inboundId) })
  if (!row?.spaceId) throw new LibraryError("That email is gone", 404)
  if ((await roleIn(userId, row.spaceId)) !== "owner")
    throw new LibraryError("Only the space's owner can do that", 403)
  // one answer, atomically: a double click or a second tab finds it already decided
  const [decided] = await db
    .update(inboundEmails)
    .set({ status: add ? "approved" : "discarded", decidedBy: userId, decidedAt: new Date() })
    .where(and(eq(inboundEmails.id, inboundId), eq(inboundEmails.status, "held")))
    .returning({ id: inboundEmails.id })
  if (!decided) throw new LibraryError("That email was already dealt with", 409)
  if (add)
    await enqueue("inbound", { inboundId, approvedBy: userId }).catch(async (error) => {
      // not queued: back to held, so the owner can say yes again
      await db
        .update(inboundEmails)
        .set({ status: "held", decidedBy: null, decidedAt: null })
        .where(and(eq(inboundEmails.id, inboundId), eq(inboundEmails.status, "approved")))
      throw error
    })
  await db
    .update(inboxItems)
    .set({ dismissedAt: new Date() })
    .where(
      and(
        eq(inboxItems.ownerId, userId),
        eq(inboxItems.kind, "held-mail"),
        sql`${inboxItems.data}->>'inboundId' = ${inboundId}`,
      ),
    )
  return { added: add }
}

// ------------------------------------------------------------------ invite by email

/** Invites sent today, per person and in all, by this one web process (konkyo.xyz runs one). */
const sentToday = new Map<string, { day: string; count: number }>()
const sentByEveryone = { day: "", count: 0 }

/** Takes a slot before anything is awaited, so parallel requests can't all see the same count. */
function takeInviteSlot(userId: string, day: string) {
  if (sentByEveryone.day !== day) Object.assign(sentByEveryone, { day, count: 0 })
  const mine = sentToday.get(userId)
  const used = mine?.day === day ? mine.count : 0
  if (used >= EMAIL.invitesPerDay)
    throw new LibraryError(
      `That's ${EMAIL.invitesPerDay} invites today. Share the link instead.`,
      429,
    )
  if (sentByEveryone.count >= EMAIL.invitesPerDayTotal)
    throw new LibraryError(
      "Konkyo has sent all the invites it can today. Share the link instead.",
      429,
    )
  sentToday.set(userId, { day, count: used + 1 })
  sentByEveryone.count++
  return () => {
    const now = sentToday.get(userId)
    if (now?.day === day) sentToday.set(userId, { day, count: Math.max(0, now.count - 1) })
    if (sentByEveryone.day === day) sentByEveryone.count = Math.max(0, sentByEveryone.count - 1)
  }
}

/**
 * An invite to the space by email (plan F59): the space's link, from a kept account that may hand
 * it on, to an address that isn't in the space yet, a few a day each and in all. Resend's
 * idempotency key (the email's own content) keeps a double click from sending twice.
 */
export async function inviteByEmail(userId: string, spaceId: string, to: string) {
  if (!emailReady()) throw new LibraryError("Email isn't set up on this server", 503)
  const address = to.trim().toLowerCase()
  // a guest's invites would go out under any name they typed: keeping the account comes first
  const sender = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { isAnonymous: true, name: true },
  })
  if (!sender || sender.isAnonymous)
    throw new LibraryError("Keep your account first, then you can invite by email.", 403)
  const refund = takeInviteSlot(userId, new Date().toISOString().slice(0, 10))
  try {
    await sendInvite(userId, spaceId, address, sender.name)
    return { sent: true }
  } catch (error) {
    refund()
    throw error
  }
}

async function sendInvite(userId: string, spaceId: string, address: string, senderName: string) {
  const invite = await inviteFor(userId, spaceId)
  if (!invite) throw new LibraryError("Ask the owner for an invite link first", 409)

  const already = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(${user.email}) = ${address}`)
    .limit(1)
  const person = already[0]
  if (person) {
    const space = await db.query.folders.findFirst({
      where: eq(folders.id, spaceId),
      columns: { ownerId: true },
    })
    const member = await db.query.spaceMembers.findFirst({
      where: and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, person.id)),
    })
    if (space?.ownerId === person.id || member)
      throw new LibraryError("They're already in this space", 409)
  }

  const [space] = await db
    .select({ name: folders.name })
    .from(folders)
    .where(eq(folders.id, spaceId))
  const [sources] = await db
    .select({ n: count() })
    .from(fileFolders)
    .innerJoin(files, and(eq(files.id, fileFolders.fileId), isNull(files.deletedAt)))
    .where(eq(fileFolders.folderId, spaceId))
  const [members] = await db
    .select({ n: count() })
    .from(spaceMembers)
    .where(eq(spaceMembers.spaceId, spaceId))
  const mail = inviteEmail({
    inviter: senderName.trim() || "Someone",
    space: space?.name ?? "a space",
    sources: sources?.n ?? 0,
    members: (members?.n ?? 0) + 1,
    url: `${APP.url}${invite.path}`,
  })
  // the same email twice (a double click) is sent once; a different email is a different key
  const content = createHash("sha256")
    .update(`${address}\n${mail.subject}\n${mail.html}`)
    .digest("hex")
  await sendEmail({
    to: address,
    ...mail,
    kind: "invite",
    idempotencyKey: `invite/${spaceId}/${userId}/${content.slice(0, 32)}`,
  }).catch((error) => {
    if (error instanceof EmailError)
      throw new LibraryError(error.message, error.code?.includes("quota") ? 429 : 503)
    throw error
  })
}

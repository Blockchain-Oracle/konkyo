import { db, schema } from "@konkyo/db"
import { addressOf, EmailError, inboundDomain, verifyInbound } from "@konkyo/email"
import { enqueue } from "@konkyo/jobs"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { NextResponse } from "next/server"

const { inboundEmails, folders } = schema

/** The address tokens among the recipients that name a space here. */
async function knownTokens(to: string[]) {
  const domain = inboundDomain().toLowerCase()
  const tokens = to.flatMap((value) => {
    const [local, host] = (addressOf(value) ?? "").split("@")
    return local && host === domain ? [local] : []
  })
  if (!tokens.length) return []
  const rows = await db
    .select({ token: folders.inboundToken })
    .from(folders)
    .where(and(inArray(folders.inboundToken, tokens), isNull(folders.deletedAt)))
  return rows
}

/**
 * Resend's webhook for mail sent to a space's address. The signature is checked on the
 * raw body; the email is recorded once (Resend's id is unique) and handed to the worker, which
 * reads it in full. Mail to an address no space has is recorded and goes no further: no job, no
 * Resend call. Answers fast: Resend retries what's slow.
 */
export async function POST(request: Request) {
  const raw = await request.text()
  let event: ReturnType<typeof verifyInbound>
  try {
    event = verifyInbound(raw, request.headers)
  } catch (error) {
    if (error instanceof EmailError)
      return NextResponse.json({ error: error.message }, { status: 503 })
    return NextResponse.json({ error: "Bad signature" }, { status: 401 })
  }
  // another kind of event: nothing to do, and no reason for Resend to retry it
  if (!event) return NextResponse.json({ ok: true })

  const known = (await knownTokens(event.to)).length > 0
  const [row] = await db
    .insert(inboundEmails)
    .values({
      emailId: event.emailId,
      // the raw value when it isn't one readable mailbox: the worker holds such mail anyway
      from: addressOf(event.from) ?? event.from.slice(0, 200).toLowerCase(),
      subject: event.subject.slice(0, 300),
      ...(known ? {} : { status: "unknown" as const, reason: "No space has that address" }),
    })
    .onConflictDoNothing()
    .returning({ id: inboundEmails.id, status: inboundEmails.status })
  // A retried delivery whose first enqueue failed is still "received": queue it again (the
  // worker claims each email once, so a second job does nothing).
  const queued =
    row ??
    (await db.query.inboundEmails.findFirst({
      where: eq(inboundEmails.emailId, event.emailId),
      columns: { id: true, status: true },
    }))
  if (queued?.status === "received") await enqueue("inbound", { inboundId: queued.id })
  return NextResponse.json({ ok: true })
}

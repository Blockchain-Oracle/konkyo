import { db, schema } from "@konkyo/db"
import { addressOf, EmailError, verifyInbound } from "@konkyo/email"
import { enqueue } from "@konkyo/jobs"
import { NextResponse } from "next/server"

/**
 * Resend's webhook for mail sent to a space's address (plan F59). The signature is checked on the
 * raw body; the email is recorded once (Resend's id is unique, so a retried delivery is a no-op)
 * and handed to the worker, which reads it in full. Answers fast: Resend retries what's slow.
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
  const [row] = await db
    .insert(schema.inboundEmails)
    .values({
      emailId: event.emailId,
      from: addressOf(event.from),
      subject: event.subject.slice(0, 300),
    })
    .onConflictDoNothing()
    .returning({ id: schema.inboundEmails.id })
  if (row) await enqueue("inbound", { inboundId: row.id }, row.id)
  return NextResponse.json({ ok: true })
}
